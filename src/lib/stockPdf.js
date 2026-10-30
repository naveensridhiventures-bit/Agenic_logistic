import { dayStock, stockSummaryRange, packetText } from './stock'
import { addDays, fmtDate, sum, todayStr } from './util'

const COL = { brand: [91, 61, 245], ink: [17, 24, 39], mute: [107, 114, 128], pos: [16, 150, 100], neg: [214, 48, 73], warn: [200, 120, 10] }
const kg = (n) => `${Math.round((Number(n) || 0) * 100) / 100} kg`
const D = (s) => fmtDate(s, { day: 'numeric', month: 'short' })

export async function buildStockPdf({ products, from, to, data, title = 'STOCK REPORT - DATE WISE', by = '' }) {
  const [{ jsPDF }, atMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = atMod.default
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297
  const H = 210
  const M = 12
  const company = data.settings.company || 'Agenic'
  let first = true
  if (products.length > 1) {
    first = false
    doc.setFillColor(...COL.brand)
    doc.rect(0, 0, W, 26, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(company, M, 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`${title}${by ? `  |  Prepared by ${by}` : ''}`, M, 19)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('All products summary', W - M, 12, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`${D(from)} to ${D(to)}`, W - M, 19, { align: 'right' })
    const body = products.map((p) => {
      const r = stockSummaryRange(p, from, to, data)
      const made = sum(r, (d) => d.produced)
      const sent = sum(r, (d) => d.dispatched)
      const waste = sum(r, (d) => d.waste)
      const now = dayStock(p, to, data)
      return [p.name, kg(made), kg(sent), kg(waste), made ? `${((waste / made) * 100).toFixed(1)}%` : '-', kg(now.closing), p.packetKg ? packetText(now.closing, p) : '-']
    })
    autoTable(doc, {
      startY: 34,
      margin: { left: M, right: M, top: M },
      theme: 'grid',
      head: [['Product', 'Produced', 'Dispatched', 'Wasted', 'Wastage', `In hand on ${D(to)}`, 'Packets in hand']],
      body,
      styles: { fontSize: 10, cellPadding: 3, lineColor: [225, 228, 238], lineWidth: 0.2, textColor: COL.ink },
      headStyles: { fillColor: COL.brand, textColor: 255 },
      alternateRowStyles: { fillColor: [250, 250, 253] },
      columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [i, { halign: 'right' }])),
      didParseCell: (h) => {
        if (h.section === 'body' && h.column.index === 3 && !String(h.cell.raw).startsWith('0 ')) h.cell.styles.textColor = COL.neg
        if (h.section === 'body' && h.column.index === 5) h.cell.styles.fontStyle = 'bold'
      }
    })
  }
  for (const p of products) {
    const rows = stockSummaryRange(p, from, to, data)
    if (!first) doc.addPage()
    first = false
    doc.setFillColor(...COL.brand)
    doc.rect(0, 0, W, 26, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(company, M, 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`${title}${by ? `  |  Prepared by ${by}` : ''}`, M, 19)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text(p.name, W - M, 12, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(`${D(from)} to ${D(to)}${p.packetKg ? `  |  1 packet = ${p.packetKg} kg` : ''}`, W - M, 19, { align: 'right' })
    const now = dayStock(p, to, data)
    doc.setTextColor(...COL.ink)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text(`Stock in hand on ${D(to)}: ${kg(now.closing)}${p.packetKg ? ` (${packetText(now.closing, p)})` : ''}`, M, 34)
    if (now.closingBatches.length) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8.5)
      doc.setTextColor(...COL.mute)
      doc.text(`Made on: ${now.closingBatches.map((b) => `${D(b.date)} - ${kg(b.kg)}`).join('   |   ')}`, M, 39, { maxWidth: W - 2 * M })
    }
    const chron = [...rows].reverse()
    const made = sum(rows, (d) => d.produced)
    const sent = sum(rows, (d) => d.dispatched)
    const wasted = sum(rows, (d) => d.waste)
    const wp = made ? (wasted / made) * 100 : 0
    const tiles = [
      ['Produced', kg(made), COL.pos],
      ['Dispatched', kg(sent), COL.ink],
      ['Wasted', kg(wasted), wasted ? COL.neg : COL.ink],
      ['Wastage', made ? `${wp.toFixed(1)}%` : '-', wp > 5 ? COL.neg : COL.pos],
      ['In hand', kg(now.closing), COL.brand]
    ]
    const tw = (W - 2 * M - 4 * 4) / 5
    tiles.forEach(([lab, val, col], i) => {
      const x = M + i * (tw + 4)
      doc.setDrawColor(225, 228, 238)
      doc.setFillColor(248, 249, 253)
      doc.roundedRect(x, 44, tw, 17, 2.5, 2.5, 'FD')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.5)
      doc.setTextColor(...COL.mute)
      doc.text(lab.toUpperCase(), x + 3, 49.5)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(...col)
      doc.text(val, x + 3, 57.5)
    })
    // produced vs dispatched bars per day
    let chartBottom = 66
    if (chron.length > 1) {
      const cy = 64
      const ch = 30
      const mx = Math.max(1, ...chron.flatMap((d) => [d.produced, d.dispatched]))
      const bw = Math.min(14, (W - 2 * M) / chron.length)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      chron.slice(-28).forEach((d, i) => {
        const x = M + i * bw
        const hm = (d.produced / mx) * ch
        const hs = (d.dispatched / mx) * ch
        doc.setFillColor(...COL.brand)
        doc.rect(x + 1, cy + ch - hm, bw / 2 - 1, hm, 'F')
        doc.setFillColor(34, 180, 215)
        doc.rect(x + bw / 2, cy + ch - hs, bw / 2 - 1, hs, 'F')
        doc.setTextColor(...COL.mute)
        doc.text(fmtDate(d.date, { day: 'numeric' }), x + bw / 2, cy + ch + 3.5, { align: 'center' })
      })
      doc.setFillColor(...COL.brand)
      doc.rect(W - M - 52, cy - 1, 3, 3, 'F')
      doc.setTextColor(...COL.ink)
      doc.text('Produced', W - M - 48, cy + 1.5)
      doc.setFillColor(34, 180, 215)
      doc.rect(W - M - 28, cy - 1, 3, 3, 'F')
      doc.text('Dispatched', W - M - 24, cy + 1.5)
      chartBottom = cy + ch + 8
    }
    autoTable(doc, {
      startY: chartBottom + 2,
      margin: { left: M, right: M, top: M, bottom: 14 },
      theme: 'grid',
      head: [['Date', 'Opening (carried)', 'Produced', 'Dispatched', 'Wasted', 'Closing', 'Closing packets', 'Dispatched from stock of', 'Note']],
      body: rows.length
        ? rows.map((d) => [
            fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' }),
            kg(d.opening),
            d.produced ? kg(d.produced) : '-',
            d.dispatched ? kg(d.dispatched) : '-',
            d.waste ? kg(d.waste) : '-',
            kg(d.closing),
            p.packetKg ? packetText(d.closing, p) : '-',
            d.alloc.filter((a) => a.type === 'dispatch').map((a) => `${D(a.batchDate)}: ${kg(a.kg)}`).join(', ') || '-',
            [d.short ? `Short by ${kg(d.short)}` : '', d.note].filter(Boolean).join(' ') || '-'
          ])
        : [['No stock entries in this period', '', '', '', '', '', '', '', '']],
      styles: { fontSize: 8.4, cellPadding: 1.9, lineColor: [225, 228, 238], lineWidth: 0.2, textColor: COL.ink },
      headStyles: { fillColor: COL.brand, textColor: 255 },
      alternateRowStyles: { fillColor: [250, 250, 253] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right', fontStyle: 'bold' }, 6: { halign: 'right' }, 7: { cellWidth: 60 }, 8: { cellWidth: 40 } },
      didParseCell: (h) => {
        if (h.section !== 'body') return
        if (h.column.index === 4 && h.cell.raw !== '-') h.cell.styles.textColor = COL.neg
        if (h.column.index === 2 && h.cell.raw !== '-') h.cell.styles.textColor = COL.pos
        if (h.column.index === 8 && String(h.cell.raw).startsWith('Short')) h.cell.styles.textColor = COL.neg
      }
    })
  }
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COL.mute)
    doc.text(`${company} - stock report - generated ${fmtDate(todayStr(), { day: 'numeric', month: 'short', year: 'numeric' })}`, M, H - 6)
    doc.text(`Page ${i} of ${n}`, W - M, H - 6, { align: 'right' })
  }
  return { doc, filename: `Agenic-Stock-Report-${from}-to-${to}.pdf` }
}
export { addDays }
