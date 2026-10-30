import { addDays, fmtDate, todayStr } from './util'

const COL = { brand: [91, 61, 245], ink: [17, 24, 39], mute: [107, 114, 128], pos: [16, 150, 100], neg: [214, 48, 73] }
const D = (s) => fmtDate(s, { day: '2-digit', month: 'short', year: 'numeric' })

/** Short label for a column header: first word(s) of the customer name. */
export const shortName = (n) => String(n || '').trim().split(/\s+/).slice(0, 2).join(' ').slice(0, 14)

/**
 * Per customer per day: R = cash received that day, NR = delivered that day but no cash received,
 * '' = nothing delivered and nothing received.
 */
export function cashMatrix(customerIds, from, to, data) {
  const days = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  const cells = {}
  const get = (cid, date) => (cells[`${date}|${cid}`] ||= { billed: 0, got: 0 })
  const ids = new Set(customerIds)
  data.deliveries.forEach((x) => {
    if (ids.has(x.customerId) && x.date >= from && x.date <= to) get(x.customerId, x.date).billed += (Number(x.qty) || 0) * (Number(x.rate) || 0)
  })
  data.payments.forEach((p) => {
    if (ids.has(p.customerId) && p.date >= from && p.date <= to) get(p.customerId, p.date).got += Number(p.amount) || 0
  })
  const status = (cid, date) => {
    const c = cells[`${date}|${cid}`]
    if (!c) return { s: '', amt: 0 }
    if (c.got > 0.5) return { s: 'R', amt: c.got }
    if (c.billed > 0) return { s: 'NR', amt: c.billed }
    return { s: '', amt: 0 }
  }
  return { days, status }
}

export async function buildCashPdf({ customers, from, to, data, showAmounts = true }) {
  const [{ jsPDF }, atMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = atMod.default
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297
  const M = 12
  const company = data.settings.company || 'Agenic'
  const { days, status } = cashMatrix(customers.map((c) => c.id), from, to, data)

  let rCount = 0
  let nrCount = 0
  let got = 0
  let notGot = 0
  days.forEach((d) =>
    customers.forEach((c) => {
      const x = status(c.id, d)
      if (x.s === 'R') (rCount++, (got += x.amt))
      if (x.s === 'NR') (nrCount++, (notGot += x.amt))
    })
  )

  doc.setFillColor(...COL.brand)
  doc.rect(0, 0, W, 24, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.text(company, M, 11)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.text('Cash received report', M, 18)
  doc.text(from === to ? D(from) : `${D(from)} to ${D(to)}`, W - M, 18, { align: 'right' })

  let y = 30
  const tile = (x, w, label, value, color) => {
    doc.setDrawColor(225, 228, 238)
    doc.setFillColor(248, 249, 253)
    doc.roundedRect(x, y, w, 15, 2.5, 2.5, 'FD')
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...COL.mute)
    doc.text(label.toUpperCase(), x + 3, y + 5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.setTextColor(...color)
    doc.text(value, x + 3, y + 11.5)
  }
  const tw = (W - 2 * M - 9) / 4
  const rs = (n) => `Rs ${Math.round(n).toLocaleString('en-IN')}`
  tile(M, tw, 'Cash received (R)', `${rCount} times  |  ${rs(got)}`, COL.pos)
  tile(M + tw + 3, tw, 'Not received (NR)', `${nrCount} times  |  ${rs(notGot)} billed`, COL.neg)
  tile(M + 2 * (tw + 3), tw, 'Customers', String(customers.length), COL.ink)
  tile(M + 3 * (tw + 3), tw, 'Days', String(days.length), COL.ink)
  y += 20

  // split customers across tables so columns stay readable (max 9 per block)
  const PER = 9
  for (let i = 0; i < customers.length; i += PER) {
    const part = customers.slice(i, i + PER)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, bottom: 14 },
      head: [['Date', ...part.map((c) => shortName(c.name))]],
      body: days.map((d) => [
        fmtDate(d, { day: '2-digit', month: 'short', weekday: 'short' }),
        ...part.map((c) => {
          const x = status(c.id, d)
          if (!x.s) return '-'
          return showAmounts ? `${x.s}\n${Math.round(x.amt).toLocaleString('en-IN')}` : x.s
        })
      ]),
      headStyles: { fillColor: COL.brand, textColor: 255, halign: 'center', fontSize: 9 },
      styles: { fontSize: 10, cellPadding: 2, lineColor: [225, 228, 238], lineWidth: 0.2, halign: 'center', valign: 'middle', textColor: COL.ink },
      columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 30 } },
      alternateRowStyles: { fillColor: [250, 250, 254] },
      didParseCell: (h) => {
        if (h.section !== 'body' || h.column.index === 0) return
        const t = String(h.cell.raw)
        if (t.startsWith('R')) {
          h.cell.styles.fillColor = [220, 247, 235]
          h.cell.styles.textColor = COL.pos
          h.cell.styles.fontStyle = 'bold'
        } else if (t.startsWith('NR')) {
          h.cell.styles.fillColor = [253, 228, 232]
          h.cell.styles.textColor = COL.neg
          h.cell.styles.fontStyle = 'bold'
        } else h.cell.styles.textColor = [170, 175, 190]
      }
    })
    y = doc.lastAutoTable.finalY + 8
    if (y > 170 && i + PER < customers.length) {
      doc.addPage()
      y = 14
    }
  }

  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFontSize(8)
    doc.setTextColor(...COL.mute)
    doc.setFont('helvetica', 'normal')
    doc.text('R = cash received that day   |   NR = delivered, cash not received   |   - = no delivery', M, 205)
    doc.text(`Page ${p}/${pages}  |  Generated ${D(todayStr())}`, W - M, 205, { align: 'right' })
  }
  return { doc, filename: `agenic-cash-received-${from}_to_${to}.pdf`, summary: { rCount, nrCount, got, notGot } }
}
