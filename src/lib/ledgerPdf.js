import { customerLedger } from './ledger'
import { fmtDate, todayStr } from './util'

const COL = { brand: [91, 61, 245], ink: [17, 24, 39], mute: [107, 114, 128], pos: [16, 150, 100], neg: [214, 48, 73] }
const num = (n) => Math.abs(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const bal = (n) => (Math.abs(n) < 0.5 ? '0.00' : `${num(n)} ${n > 0 ? 'Dr' : 'Cr'}`)
const D = (s) => fmtDate(s, { day: '2-digit', month: 'short', year: 'numeric' })

/** One PDF, one ledger per customer (each starts on a new page), with a summary page when several are chosen. */
export async function buildLedgerPdf({ customers, from, to, data }) {
  const [{ jsPDF }, atMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = atMod.default
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = 210
  const H = 297
  const M = 14
  const company = data.settings.company || 'Agenic'
  const ledgers = customers.map((c) => customerLedger(c, from, to, data))
  const periodText = from ? `${D(from)} to ${D(to)}` : `All entries up to ${D(to)}`
  const header = (title) => {
    doc.setFillColor(...COL.brand)
    doc.rect(0, 0, W, 26, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.text(company, M, 12)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(title, M, 19)
    doc.text(periodText, W - M, 19, { align: 'right' })
  }
  const tile = (x, y, w, label, value, color) => {
    doc.setDrawColor(225, 228, 238)
    doc.setFillColor(248, 249, 253)
    doc.roundedRect(x, y, w, 17, 2.5, 2.5, 'FD')
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(...COL.mute)
    doc.text(label.toUpperCase(), x + 3, y + 5.5)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11.5)
    doc.setTextColor(...(color || COL.ink))
    doc.text(value, x + 3, y + 13)
  }
  let first = true
  if (ledgers.length > 1) {
    first = false
    header('CUSTOMER LEDGER SUMMARY')
    doc.setTextColor(...COL.ink)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text(`${ledgers.length} customers`, M, 36)
    const tot = (k) => ledgers.reduce((s, l) => s + l[k], 0)
    autoTable(doc, {
      startY: 40,
      margin: { left: M, right: M, top: M },
      theme: 'grid',
      head: [['Customer', 'Opening', 'Billed', 'Received', 'Closing balance']],
      body: ledgers.map((l) => [l.customer.name, bal(l.opening), num(l.billed), num(l.received), bal(l.closing)]),
      foot: [['Total', bal(tot('opening')), num(tot('billed')), num(tot('received')), bal(tot('closing'))]],
      styles: { fontSize: 9, cellPadding: 2.2, lineColor: [225, 228, 238], lineWidth: 0.2, textColor: COL.ink },
      headStyles: { fillColor: COL.brand, textColor: 255 },
      footStyles: { fillColor: [243, 244, 250], textColor: COL.ink, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 253] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right', fontStyle: 'bold' } },
      didParseCell: (h) => {
        if (h.section === 'body' && h.column.index === 4 && String(h.cell.raw).endsWith('Dr')) h.cell.styles.textColor = COL.neg
      }
    })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COL.mute)
    doc.text('Dr = customer owes us.  Cr = customer has paid in advance.', M, doc.lastAutoTable.finalY + 6)
  }
  for (const l of ledgers) {
    if (!first) doc.addPage()
    first = false
    const c = l.customer
    header('ACCOUNT LEDGER')
    doc.setTextColor(...COL.ink)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.text(c.name, M, 36)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...COL.mute)
    doc.text([c.area, c.phone ? `Ph: ${c.phone}` : '', c.address].filter(Boolean).join('  |  ') || ' ', M, 42, { maxWidth: W - 2 * M })
    const tw = (W - 2 * M - 9) / 4
    tile(M, 47, tw, 'Opening', bal(l.opening))
    tile(M + (tw + 3), 47, tw, 'Billed (Dr)', num(l.billed))
    tile(M + 2 * (tw + 3), 47, tw, 'Received (Cr)', num(l.received), COL.pos)
    tile(M + 3 * (tw + 3), 47, tw, l.closing > 0.5 ? 'Amount due' : 'Closing', bal(l.closing), l.closing > 0.5 ? COL.neg : COL.pos)
    const body = [['', 'Opening balance b/f', '', '', '', bal(l.opening)]]
    for (const e of l.entries) body.push([D(e.date), e.text, e.kind, e.dr ? num(e.dr) : '', e.cr ? num(e.cr) : '', bal(e.bal)])
    if (!l.entries.length) body.push(['', 'No entries in this period', '', '', '', ''])
    autoTable(doc, {
      startY: 69,
      margin: { left: M, right: M, top: 30, bottom: 16 },
      theme: 'plain',
      head: [['Date', 'Particulars', 'Type', 'Debit', 'Credit', 'Balance']],
      body,
      foot: [['', 'Closing balance c/f', '', num(l.billed), num(l.received), bal(l.closing)]],
      showFoot: 'lastPage',
      styles: { fontSize: 8.6, cellPadding: { top: 2, bottom: 2, left: 2, right: 2 }, textColor: COL.ink, lineColor: [232, 234, 242], lineWidth: { bottom: 0.2 } },
      headStyles: { fillColor: [243, 244, 250], textColor: COL.brand, fontStyle: 'bold', lineWidth: { bottom: 0.5 }, lineColor: COL.brand },
      footStyles: { fillColor: [243, 244, 250], textColor: COL.ink, fontStyle: 'bold', lineWidth: { top: 0.5 }, lineColor: COL.ink },
      columnStyles: { 0: { cellWidth: 24 }, 2: { cellWidth: 18 }, 3: { halign: 'right', cellWidth: 24 }, 4: { halign: 'right', cellWidth: 24 }, 5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' } },
      didParseCell: (h) => {
        if (h.section === 'body' && h.column.index === 4 && h.cell.raw) h.cell.styles.textColor = COL.pos
        if (h.section === 'body' && h.row.index === 0) h.cell.styles.fontStyle = 'italic'
        if (h.section === 'body' && h.column.index === 2) h.cell.styles.textColor = h.cell.raw === 'Receipt' ? COL.pos : COL.mute
        if (h.section === 'foot' && h.column.index === 5 && l.closing > 0.5) h.cell.styles.textColor = COL.neg
      }
    })
    let y = doc.lastAutoTable.finalY + 8
    if (y > H - 30) {
      doc.addPage()
      y = 36
    }
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...(l.closing > 0.5 ? COL.neg : COL.pos))
    doc.text(l.closing > 0.5 ? `Please settle the outstanding balance of Rs. ${num(l.closing)}.` : l.closing < -0.5 ? `Advance balance in your favour: Rs. ${num(-l.closing)}.` : 'Account is fully settled. Thank you!', M, y)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COL.mute)
    doc.text(`${l.kg ? `${Math.round(l.kg * 10) / 10} kg supplied in this period.  ` : ''}Dr = amount to receive from you.  Cr = amount received.`, M, y + 5)
  }
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COL.mute)
    doc.text(`${company} - customer ledger - generated ${D(todayStr())}`, M, H - 8)
    doc.text(`Page ${i} of ${n}`, W - M, H - 8, { align: 'right' })
  }
  const one = ledgers.length === 1 ? ledgers[0].customer.name.replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') : `${ledgers.length}-customers`
  return { doc, filename: `Agenic-Ledger-${one}-${from || 'all'}-to-${to}.pdf` }
}
