// Date-wise delivery report for management (status, payment collected, remarks).
import { logRange } from './deliveryLog'
import { fmtDate, fmtLong, sum, todayStr } from './util'

// Payments are intentionally NOT shown here - they are recorded later in Payments and appear in customer ledgers.
const rs = (n) => `Rs. ${Math.round(Number(n) || 0).toLocaleString('en-IN')}`
const kg1 = (n) => `${Math.round((Number(n) || 0) * 10) / 10} kg`
const COL = { brand: [91, 61, 245], ink: [17, 24, 39], mute: [107, 114, 128], pos: [16, 150, 100], neg: [214, 48, 73], warn: [200, 120, 10] }
const hhmm = (iso) => (iso && iso.length >= 16 ? iso.slice(11, 16) : '-')
const STATUS = { delivered: 'Delivered', skipped: 'Not delivered', pending: 'Not done yet' }

export async function buildDeliveryPdf({ from, to, data }) {
  const [{ jsPDF }, atMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = atMod.default
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297
  const H = 210
  const M = 12
  const company = data.settings.company || 'Agenic'
  const days = logRange(from, to, data)
  if (!days.length) throw new Error('No orders in this period')
  let y = 0

  doc.setFillColor(...COL.brand)
  doc.rect(0, 0, W, 30, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text(company, M, 13)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('DELIVERY REPORT - DATE WISE', M, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text(`${fmtDate(from, { day: 'numeric', month: 'short', year: 'numeric' })} to ${fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`, W - M, 13, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text(`${days.length} day${days.length === 1 ? '' : 's'} with orders`, W - M, 20, { align: 'right' })
  y = 38

  const T = {
    orders: sum(days, (d) => d.orders),
    done: sum(days, (d) => d.done),
    skipped: sum(days, (d) => d.skipped),
    kg: sum(days, (d) => d.kg),
    bill: sum(days, (d) => d.bill),
    cash: sum(days, (d) => d.cash),
    gpay: sum(days, (d) => d.gpay),
    collected: sum(days, (d) => d.collected),
    pending: sum(days, (d) => d.pending)
  }
  doc.setTextColor(...COL.ink)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.text('Summary by date', M, y)
  y += 3
  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M, top: M },
    theme: 'grid',
    head: [['Date', 'Orders', 'Delivered', 'Not delivered', 'Kg', 'Bill']],
    body: days.map((d) => [fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' }), d.orders, d.done, d.skipped || '-', kg1(d.kg), rs(d.bill)]),
    foot: [['Total', T.orders, T.done, T.skipped || '-', kg1(T.kg), rs(T.bill)]],
    styles: { fontSize: 8.6, cellPadding: 2, lineColor: [225, 228, 238], lineWidth: 0.2, textColor: COL.ink },
    headStyles: { fillColor: COL.brand, textColor: 255 },
    footStyles: { fillColor: [243, 244, 250], textColor: COL.ink, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 253] },
    columnStyles: Object.fromEntries([1, 2, 3, 4, 5].map((i) => [i, { halign: 'right' }])),
  })

  for (const d of days) {
    doc.addPage()
    y = M + 4
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(...COL.ink)
    doc.text(`${fmtLong(d.date)} ${d.date.slice(0, 4)}`, M, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COL.mute)
    doc.text(`${d.done} of ${d.orders} delivered${d.skipped ? `, ${d.skipped} not delivered` : ''} | ${kg1(d.kg)} | Bill ${rs(d.bill)}`, M, y + 6)
    autoTable(doc, {
      startY: y + 10,
      margin: { left: M, right: M, top: M },
      theme: 'grid',
      head: [['Delivered by', 'Customer', 'Kg', 'Bill', 'Status', 'Time', 'Remark / voice note']],
      body: d.rows.map((r) => [
        r.by,
        r.name,
        kg1(r.kg),
        rs(r.bill),
        STATUS[r.status] + (r.unlocked ? ' (unlocked early)' : ''),
        hhmm(r.doneAt),
        [r.remark, r.voiceId ? '[voice note recorded]' : ''].filter(Boolean).join(' ') || '-'
      ]),
      styles: { fontSize: 8.4, cellPadding: 1.9, lineColor: [225, 228, 238], lineWidth: 0.2, textColor: COL.ink, valign: 'middle' },
      headStyles: { fillColor: COL.brand, textColor: 255 },
      alternateRowStyles: { fillColor: [250, 250, 253] },
      columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 6: { cellWidth: 95 } },
      didParseCell: (h) => {
        if (h.section !== 'body') return
        const raw = String(h.cell.raw)
        if (h.column.index === 4) {
          h.cell.styles.fontStyle = 'bold'
          h.cell.styles.textColor = raw.startsWith('Delivered') ? COL.pos : raw.startsWith('Not delivered') ? COL.neg : COL.warn
        }
      }
    })
  }

  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COL.mute)
    doc.text(`${company} - delivery report - generated ${fmtDate(todayStr(), { day: 'numeric', month: 'short', year: 'numeric' })}`, M, H - 6)
    doc.text(`Page ${i} of ${n}`, W - M, H - 6, { align: 'right' })
  }
  return { doc, filename: `Agenic-Delivery-Report-${from}-to-${to}.pdf` }
}
