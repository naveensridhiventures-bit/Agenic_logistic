// Driver route sheets: big stop numbers, schematic map, tap-to-navigate links and QR codes.
import { computeDues } from './calc'
import { fmtDur, hasLL, mapsLinks, mapsStopUrl, routeMetrics } from './geo'
import { driverStart, loadOf, routesForDate } from './routing'
import { fmtLong } from './util'

const rs = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`
const COL = { brand: [91, 61, 245], ink: [17, 24, 39], mute: [107, 114, 128], pos: [16, 150, 100], neg: [214, 48, 73], warn: [200, 120, 10], soft: [243, 244, 250], link: [29, 78, 216] }
const slug = (s) => String(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')

export async function buildRoutePdf({ date, data, driverId }) {
  const [{ jsPDF }, atMod, QR] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('qrcode')])
  const autoTable = atMod.default
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const H = 297
  const M = 12
  const company = data.settings.company || 'Agenic'
  const { drivers, routes, unassigned } = routesForDate(date, data)
  const all = driverId === 'all'
  const list = all ? drivers.filter((d) => routes[d.id].length) : drivers.filter((d) => d.id === driverId)
  if (!list.length) throw new Error('No assigned stops to put in the route sheet')
  const duesBy = new Map(computeDues(data).map((d) => [d.customer.id, d]))
  const dateLong = `${fmtLong(date)} ${date.slice(0, 4)}`
  let y = 0
  const need = (h) => {
    if (y + h > H - 16) {
      doc.addPage()
      y = M + 4
    }
  }

  const header = (title, rightTop, rightBottom) => {
    doc.setFillColor(...COL.brand)
    doc.rect(0, 0, W, 34, 'F')
    doc.setFillColor(255, 255, 255)
    doc.setGState && doc.setGState(new doc.GState({ opacity: 0.12 }))
    doc.circle(W - 14, 6, 26, 'F')
    doc.setGState && doc.setGState(new doc.GState({ opacity: 1 }))
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(20)
    doc.text(company, M, 14)
    doc.setFontSize(8.5)
    doc.setFont('helvetica', 'normal')
    doc.text(title.toUpperCase().split('').join(' '), M, 21)
    doc.setFontSize(9)
    doc.text(dateLong, M, 28)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    if (rightTop) doc.text(rightTop, W - M, 13, { align: 'right' })
    doc.setFontSize(18)
    if (rightBottom) doc.text(rightBottom, W - M, 24, { align: 'right' })
    doc.setTextColor(...COL.ink)
    y = 42
  }
  const section = (text, space = 18) => {
    y += 2
    need(space)
    doc.setFillColor(...COL.brand)
    doc.rect(M, y - 4, 1.6, 6, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11.5)
    doc.setTextColor(...COL.ink)
    doc.text(text, M + 4, y + 0.6)
    y += 6
  }
  const chips = (items) => {
    const cols = items.length
    const gap = 3
    const cw = (W - 2 * M - gap * (cols - 1)) / cols
    items.forEach((it, i) => {
      const x = M + i * (cw + gap)
      doc.setFillColor(...COL.soft)
      doc.roundedRect(x, y, cw, 17, 2.2, 2.2, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...COL.mute)
      doc.text(it.label, x + 3, y + 5.2)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(it.small ? 9 : 13)
      doc.setTextColor(...COL.ink)
      doc.text(String(it.value), x + 3, y + 12.3, { maxWidth: cw - 5 })
    })
    y += 21
  }

  const drawMap = (x, yy, w, h, start, stops) => {
    doc.setFillColor(...COL.soft)
    doc.setDrawColor(222, 225, 238)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, yy, w, h, 2.5, 2.5, 'FD')
    const pts = []
    if (hasLL(start)) pts.push({ lat: start.lat, lng: start.lng, s: true })
    stops.forEach((s, i) => hasLL(s) && pts.push({ lat: s.lat, lng: s.lng, n: i + 1, area: s.area }))
    if (pts.length < 2) {
      doc.setFont('helvetica', 'italic')
      doc.setFontSize(9)
      doc.setTextColor(...COL.mute)
      doc.text('Map locations are not saved for these customers - use the stop list and links below.', x + w / 2, yy + h / 2, { align: 'center' })
      return
    }
    const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length
    const kx = Math.cos((lat0 * Math.PI) / 180)
    const X = pts.map((p) => p.lng * kx)
    const Yv = pts.map((p) => -p.lat)
    const minX = Math.min(...X)
    const maxX = Math.max(...X)
    const minY = Math.min(...Yv)
    const maxY = Math.max(...Yv)
    const pad = 13
    const sc = Math.min((w - 2 * pad) / (maxX - minX || 1e-6), (h - 2 * pad) / (maxY - minY || 1e-6))
    const ox = x + pad + (w - 2 * pad - (maxX - minX) * sc) / 2
    const oy = yy + pad + (h - 2 * pad - (maxY - minY) * sc) / 2
    const P = pts.map((p, i) => ({ ...p, X: ox + (X[i] - minX) * sc, Y: oy + (Yv[i] - minY) * sc }))
    // faint grid
    doc.setDrawColor(230, 232, 242)
    doc.setLineWidth(0.15)
    for (let gx = x + 10; gx < x + w; gx += 10) doc.line(gx, yy + 1, gx, yy + h - 1)
    for (let gy = yy + 10; gy < yy + h; gy += 10) doc.line(x + 1, gy, x + w - 1, gy)
    // path
    doc.setDrawColor(...COL.brand)
    doc.setLineWidth(0.9)
    doc.setLineDashPattern([2.4, 1.4], 0)
    for (let i = 1; i < P.length; i++) doc.line(P[i - 1].X, P[i - 1].Y, P[i].X, P[i].Y)
    doc.setLineDashPattern([], 0)
    // direction arrows
    doc.setFillColor(...COL.brand)
    for (let i = 1; i < P.length; i++) {
      const a = Math.atan2(P[i].Y - P[i - 1].Y, P[i].X - P[i - 1].X)
      const mx = (P[i].X + P[i - 1].X) / 2
      const my = (P[i].Y + P[i - 1].Y) / 2
      const L = Math.hypot(P[i].X - P[i - 1].X, P[i].Y - P[i - 1].Y)
      if (L < 9) continue
      const t = 1.9
      doc.triangle(mx + Math.cos(a) * t, my + Math.sin(a) * t, mx + Math.cos(a + 2.5) * t, my + Math.sin(a + 2.5) * t, mx + Math.cos(a - 2.5) * t, my + Math.sin(a - 2.5) * t, 'F')
    }
    // markers + area labels
    P.forEach((p) => {
      if (!p.s && p.area) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(6.3)
        doc.setTextColor(...COL.mute)
        const right = p.X < x + w - 34
        doc.text(p.area.slice(0, 18), right ? p.X + 4.6 : p.X - 4.6, p.Y + 0.9, { align: right ? 'left' : 'right' })
      }
      doc.setFillColor(...(p.s ? COL.pos : COL.brand))
      doc.setDrawColor(255, 255, 255)
      doc.setLineWidth(0.6)
      doc.circle(p.X, p.Y, p.s ? 3.6 : 3.3, 'FD')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(p.s ? 7.5 : p.n > 9 ? 6.2 : 7.5)
      doc.text(p.s ? 'S' : String(p.n), p.X, p.Y + 1.15, { align: 'center' })
    })
    // north arrow + scale
    doc.setFillColor(...COL.mute)
    doc.triangle(x + w - 7, yy + 4, x + w - 9, yy + 9, x + w - 5, yy + 9, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(...COL.mute)
    doc.text('N', x + w - 7, yy + 12.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text(`Sketch map, about ${Math.max(0.1, (maxX - minX) * 111.32).toFixed(1)} km wide. S = start. Follow the numbers.`, x + 3, yy + h - 2.5)
  }

  const driverPage = async (d, firstPage) => {
    if (!firstPage) doc.addPage()
    const stops = routes[d.id]
    const start = driverStart(d)
    const m = routeMetrics(start, stops)
    header('Delivery route sheet', 'DRIVER', d.name)
    chips([
      { label: 'STOPS', value: stops.length },
      { label: 'TOTAL LOAD', value: `${Math.round(loadOf(stops) * 10) / 10} kg` },
      { label: 'EST. DISTANCE', value: m.km ? `${m.km.toFixed(1)} km` : '-' },
      { label: 'EST. TIME', value: m.minutes ? fmtDur(m.minutes) : '-', small: true },
      { label: 'VEHICLE', value: d.vehicle || '-', small: true }
    ])
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.6)
    doc.setTextColor(...COL.mute)
    const meta = [d.startAddress ? `Start: ${d.startAddress}` : '', d.stretch ? `Stretch: ${d.stretch}` : '', d.phone ? `Driver phone: ${d.phone}` : ''].filter(Boolean).join('    |    ')
    if (meta) {
      const lines = doc.splitTextToSize(meta, W - 2 * M)
      doc.text(lines, M, y)
      y += lines.length * 4 + 2
    }
    section('Route at a glance', 70)
    drawMap(M, y, W - 2 * M, 44, start, stops)
    y += 50

    section('Delivery stops - in this order', 40)
    const rows = []
    const meta2 = []
    if (d.startAddress || start) {
      rows.push(['S', 'START', d.startAddress || 'Start point', '', '', '', ''])
      meta2.push(null)
    }
    stops.forEach((s, i) => {
      const due = duesBy.get(s.customerId)
      const collect = due && due.outstanding > 0.5 ? `${rs(due.outstanding)}${due.status === 'breach' ? '\nOVERDUE' : ''}` : '-'
      rows.push([i + 1, `${s.name}${s.phone ? `\n${s.phone}` : ''}`, (s.address || s.area || 'Address not saved').slice(0, 160), `${Math.round(s.kg * 10) / 10} kg`, collect, 'Open Maps', ''])
      meta2.push(s)
    })
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: M + 2 },
      theme: 'grid',
      head: [['Stop', 'Customer', 'Address', 'Quantity', 'Collect', 'Navigate', 'Done']],
      body: rows,
      foot: [['', 'Total', '', `${Math.round(loadOf(stops) * 10) / 10} kg`, '', '', '']],
      styles: { fontSize: 8.4, cellPadding: 2, lineColor: [225, 228, 238], lineWidth: 0.2, textColor: COL.ink, valign: 'middle', minCellHeight: 12 },
      headStyles: { fillColor: COL.brand, textColor: 255, fontStyle: 'bold', minCellHeight: 8 },
      footStyles: { fillColor: COL.soft, textColor: COL.ink, fontStyle: 'bold', minCellHeight: 8 },
      alternateRowStyles: { fillColor: [250, 250, 253] },
      columnStyles: { 0: { cellWidth: 12, halign: 'center' }, 1: { cellWidth: 40, fontStyle: 'bold' }, 2: { cellWidth: 54 }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 24, halign: 'center' }, 5: { cellWidth: 20, halign: 'center' }, 6: { cellWidth: 13 } },
      didParseCell: (h) => {
        if (h.section !== 'body') return
        const c = h.column.index
        if (c === 0) {
          h.cell.styles.fontSize = 15
          h.cell.styles.fontStyle = 'bold'
          h.cell.styles.textColor = h.cell.raw === 'S' ? COL.pos : COL.brand
        }
        if (c === 3) {
          h.cell.styles.fontSize = 12
          h.cell.styles.fontStyle = 'bold'
        }
        if (c === 4 && String(h.cell.raw) !== '-') {
          h.cell.styles.textColor = COL.neg
          h.cell.styles.fontStyle = 'bold'
        }
        if (c === 5 && meta2[h.row.index]) h.cell.styles.textColor = [255, 255, 255] // drawn as a button below
        if (meta2[h.row.index] === null) {
          h.cell.styles.fillColor = [226, 247, 238]
          if (c === 1 || c === 2) h.cell.styles.fontStyle = 'bold'
        }
      },
      didDrawCell: (h) => {
        if (h.section !== 'body') return
        const s = meta2[h.row.index]
        if (h.column.index === 5 && s) {
          const { x, y: cy, width, height } = h.cell
          doc.setFillColor(...COL.link)
          doc.roundedRect(x + 1.5, cy + height / 2 - 4, width - 3, 8, 1.8, 1.8, 'F')
          doc.setTextColor(255, 255, 255)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(7.4)
          doc.text('Open Maps', x + width / 2, cy + height / 2 + 1, { align: 'center' })
          doc.link(x, cy, width, height, { url: mapsStopUrl(s) })
        }
        if (h.column.index === 6 && s) {
          const { x, y: cy, width, height } = h.cell
          doc.setDrawColor(...COL.mute)
          doc.setLineWidth(0.4)
          doc.roundedRect(x + width / 2 - 3, cy + height / 2 - 3, 6, 6, 1, 1, 'S')
        }
      }
    })
    y = doc.lastAutoTable.finalY + 7

    // loading tip
    if (stops.length > 1) {
      need(12)
      doc.setFillColor(255, 247, 230)
      doc.roundedRect(M, y, W - 2 * M, 10, 2, 2, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.6)
      doc.setTextColor(...COL.warn)
      doc.text('LOADING TIP', M + 3, y + 6.2)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...COL.ink)
      doc.text(`Load the last stop first: ${stops.map((_, i) => stops.length - i).join('  >  ')}. Stop 1 goes in last so it comes out first.`, M + 28, y + 6.2, { maxWidth: W - 2 * M - 31 })
      y += 15
    }

    // QR codes
    const links = mapsLinks(start, stops)
    if (links.length) {
      section('Scan to navigate in Google Maps', 46)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.4)
      doc.setTextColor(...COL.mute)
      doc.text(start ? 'Opens turn-by-turn directions through the stops in this order, starting from the start point.' : 'Opens turn-by-turn directions through the stops in this order, starting from your current location.', M, y + 1)
      y += 5
      const size = 30
      for (let i = 0; i < links.length; i++) {
        const col = i % 5
        if (col === 0 && i > 0) {
          y += size + 12
          need(size + 14)
        }
        const x = M + col * (size + 8)
        const img = await QR.toDataURL(links[i].url, { margin: 1, width: 280, errorCorrectionLevel: 'L' })
        doc.addImage(img, 'PNG', x, y, size, size)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(...COL.ink)
        doc.text(links[i].from === links[i].to ? `Stop ${links[i].from}` : `Stops ${links[i].from}-${links[i].to}`, x + size / 2, y + size + 4.5, { align: 'center' })
        doc.link(x, y, size, size, { url: links[i].url })
      }
      y += size + 10
    }
  }

  // ---------- all-drivers cover page
  let first = true
  if (all) {
    header('Delivery route sheets', 'ALL DRIVERS', `${list.length} route${list.length > 1 ? 's' : ''}`)
    section('Today at a glance', 30)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      theme: 'grid',
      head: [['Driver', 'Vehicle', 'Stops', 'Load', 'Est. km', 'Est. time', 'Stretch / areas']],
      body: list.map((d) => {
        const m = routeMetrics(driverStart(d), routes[d.id])
        return [d.name, d.vehicle || '-', routes[d.id].length, `${Math.round(loadOf(routes[d.id]))} kg`, m.km.toFixed(1), fmtDur(m.minutes), d.stretch || [...new Set(routes[d.id].map((s) => s.area).filter(Boolean))].slice(0, 4).join(', ')]
      }),
      styles: { fontSize: 9, cellPadding: 2.6, lineColor: [225, 228, 238], lineWidth: 0.2, textColor: COL.ink },
      headStyles: { fillColor: COL.brand, textColor: 255 },
      alternateRowStyles: { fillColor: [250, 250, 253] },
      columnStyles: { 0: { fontStyle: 'bold' } }
    })
    y = doc.lastAutoTable.finalY + 8
    if (unassigned.length) {
      need(20)
      doc.setFillColor(253, 232, 236)
      doc.roundedRect(M, y, W - 2 * M, 14, 2, 2, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(...COL.neg)
      doc.text(`${unassigned.length} order(s) still have no driver: ${unassigned.map((s) => s.name).slice(0, 6).join(', ')}${unassigned.length > 6 ? '...' : ''}`, M + 3, y + 8.5, { maxWidth: W - 2 * M - 6 })
      y += 18
    }
    first = false
    doc.addPage()
    first = true
  }
  for (let i = 0; i < list.length; i++) {
    await driverPage(list[i], first && i === 0)
  }

  // ---------- footer on every page
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COL.mute)
    doc.text(`${company} - route sheet - ${dateLong}`, M, H - 7)
    doc.text(`Page ${i} of ${n}`, W - M, H - 7, { align: 'right' })
  }
  const filename = all ? `Agenic-Route-Sheets-All-Drivers-${date}.pdf` : `Agenic-Route-Sheet-${slug(list[0].name)}-${date}.pdf`
  return { doc, filename }
}
