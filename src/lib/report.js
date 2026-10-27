// PDF reports for management (daily / weekly / monthly). jsPDF is loaded on demand.
import {
  computeDues,
  deliveryPayStatus,
  PAY_LABEL,
  periodLabel,
  periodRange,
  periodRows,
  sumRows
} from './calc'
import { fmtDate, fmtLong, sum, todayStr } from './util'

// Built-in PDF fonts have no rupee glyph, so amounts print as "Rs."
const rs = (n, sign = false) => {
  const v = Math.round(Number(n) || 0)
  return `${v < 0 ? '-' : sign && v > 0 ? '+' : ''}Rs. ${Math.abs(v).toLocaleString('en-IN')}`
}
const kg1 = (n) => `${Math.round((Number(n) || 0) * 10) / 10} kg`
const COL = {
  brand: [91, 61, 245],
  ink: [17, 24, 39],
  mute: [107, 114, 128],
  pos: [16, 150, 100],
  neg: [214, 48, 73],
  warn: [200, 120, 10],
  soft: [243, 244, 250]
}
const STATUS_TXT = { breach: 'Over limit', warn: 'Near limit', ok: 'Pending', clear: 'Clear' }

export function reportFilename(mode, start, end) {
  const base = { day: 'Daily', week: 'Weekly', month: 'Monthly' }[mode]
  const when = mode === 'day' ? start : mode === 'month' ? start.slice(0, 7) : `${start}_to_${end}`
  return `Agenic-${base}-Logistics-Report-${when}.pdf`
}

export async function buildReport({ mode, anchor, data }) {
  const [{ jsPDF }, atMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = atMod.default
  const { start, end } = periodRange(mode, anchor)
  const land = mode !== 'day'
  const doc = new jsPDF({ orientation: land ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const M = 14
  const company = data.settings.company || 'Agenic'
  const pay = deliveryPayStatus(data)
  const dues = computeDues(data)
  const rows = periodRows(start, end, data, pay).reverse() // oldest first
  const T = sumRows(rows)
  const pending = dues.filter((d) => d.outstanding > 0.5).sort((a, b) => b.outstanding - a.outstanding)
  const totalPending = sum(pending, (d) => d.outstanding)
  const over = pending.filter((d) => d.status === 'breach')
  const title = { day: 'Daily Logistics Report', week: 'Weekly Logistics Report', month: 'Monthly Logistics Report' }[mode]
  const subtitle = mode === 'day' ? `${fmtLong(start)} ${start.slice(0, 4)}` : periodLabel(mode, start, end)

  // ---- header band
  doc.setFillColor(...COL.brand)
  doc.rect(0, 0, W, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.text(company, M, 13)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text('Idli batter - logistics & collections', M, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.text(title, W - M, 12, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.text(subtitle, W - M, 19, { align: 'right' })
  doc.setTextColor(...COL.ink)
  let y = 36

  const need = (h) => {
    if (y + h > H - 16) {
      doc.addPage()
      y = M + 2
    }
  }
  const section = (text, space = 16) => {
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
  const statGrid = (items, cols = 4) => {
    const gap = 3.5
    const cw = (W - 2 * M - gap * (cols - 1)) / cols
    const ch = 17
    for (let i = 0; i < items.length; i += cols) {
      need(ch + 3)
      items.slice(i, i + cols).forEach((it, j) => {
        const x = M + j * (cw + gap)
        doc.setFillColor(...COL.soft)
        doc.roundedRect(x, y, cw, ch, 2, 2, 'F')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...COL.mute)
        doc.text(it.label, x + 3, y + 5.5)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12)
        doc.setTextColor(...(it.color || COL.ink))
        doc.text(it.value, x + 3, y + 12.5)
      })
      y += ch + 3.5
    }
    doc.setTextColor(...COL.ink)
  }
  const table = ({ minSpace = 24, ...opts }) => {
    need(minSpace)
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M, top: M },
      theme: 'grid',
      styles: { fontSize: 8.6, cellPadding: 1.9, lineColor: [225, 228, 238], lineWidth: 0.2, textColor: COL.ink },
      headStyles: { fillColor: COL.brand, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: COL.soft, textColor: COL.ink, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [250, 250, 253] },
      ...opts
    })
    y = doc.lastAutoTable.finalY + 7
  }
  const paragraph = (lines) => {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.6)
    doc.setTextColor(...COL.ink)
    lines.forEach((l) => {
      const parts = doc.splitTextToSize(`-  ${l}`, W - 2 * M - 4)
      need(parts.length * 4.8 + 1)
      doc.text(parts, M + 2, y)
      y += parts.length * 4.8 + 1.2
    })
    y += 3
  }
  const colorStatus = (idx, map) => (hook) => {
    if (hook.section === 'body' && hook.column.index === idx) {
      const c = map(String(hook.cell.raw))
      if (c) {
        hook.cell.styles.textColor = c
        hook.cell.styles.fontStyle = 'bold'
      }
    }
  }
  const payColor = (t) => (t === 'Paid' ? COL.pos : t === 'Part paid' ? COL.warn : t === 'Pending' ? COL.neg : null)
  const dueColor = (t) => (t === 'Over limit' ? COL.neg : t === 'Near limit' ? COL.warn : null)

  // ---- result banner
  const profit = T.net >= 0
  need(24)
  doc.setFillColor(...(profit ? [226, 247, 238] : [253, 232, 236]))
  doc.roundedRect(M, y, W - 2 * M, 20, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(...(profit ? COL.pos : COL.neg))
  const scope = mode === 'day' ? 'DAY' : mode === 'week' ? 'WEEK' : 'MONTH'
  doc.text(`${profit ? 'PROFIT' : 'LOSS'} ${scope}`, M + 5, y + 7.5)
  doc.setFontSize(20)
  doc.text(rs(T.net, true), M + 5, y + 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(...COL.mute)
  doc.text('Sales - batter cost - driver - diesel - porter - other', W - M - 5, y + 9, { align: 'right' })
  doc.text(`Payment status as on ${fmtDate(todayStr(), { day: 'numeric', month: 'short', year: 'numeric' })}`, W - M - 5, y + 15, { align: 'right' })
  doc.setTextColor(...COL.ink)
  y += 26

  // ---- key numbers
  section('Key numbers')
  statGrid([
    { label: 'Total kg delivered', value: kg1(T.kg) },
    { label: mode === 'day' ? 'Orders' : `Orders (${T.days} days)`, value: String(T.orders) },
    { label: 'Sales', value: rs(T.revenue) },
    { label: 'Batter cost', value: rs(T.batter) },
    { label: 'Gross margin', value: rs(T.margin), color: T.margin >= 0 ? COL.pos : COL.neg },
    { label: 'Delivery expense', value: rs(T.logistics), color: COL.warn },
    { label: 'Collected (cash in)', value: rs(T.collected), color: COL.pos },
    { label: 'Unpaid on these orders', value: rs(T.due), color: T.due > 0.5 ? COL.neg : COL.pos }
  ])

  // ---- delivery expenses
  section('Delivery expenses', 50)
  const pct = (v) => (T.revenue ? `${((v / T.revenue) * 100).toFixed(1)}%` : '-')
  const perKg = (v) => (T.kg ? rs(v / T.kg) : '-')
  table({
    head: [['Expense', 'Amount', 'Per kg', '% of sales']],
    body: [
      ['Driver salary', rs(T.driver), perKg(T.driver), pct(T.driver)],
      ['Diesel', rs(T.diesel), perKg(T.diesel), pct(T.diesel)],
      ['Porter', rs(T.porter), perKg(T.porter), pct(T.porter)],
      ['Other', rs(T.other), perKg(T.other), pct(T.other)]
    ],
    foot: [['Total delivery expense', rs(T.logistics), perKg(T.logistics), pct(T.logistics)]],
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
    tableWidth: land ? 160 : 'auto'
  })
  const notesList = rows.filter((r) => r.costNote).map((r) => `${fmtDate(r.date)}: ${r.costNote}`)
  if (notesList.length) paragraph(notesList.slice(0, 6).map((n) => `Expense note - ${n}`))

  // ---- orders / day-wise
  if (mode === 'day') {
    section('Orders delivered', 50)
    const r0 = rows[0]
    const body = (r0?.deliveries || []).map((d, i) => {
      const c = data.customers.find((x) => x.id === d.customerId)
      return [i + 1, d.customerName, c?.area || '', kg1(d.qty), rs(d.rate), rs(d.qty * d.rate), PAY_LABEL[d.pay.status]]
    })
    table({
      head: [['#', 'Customer', 'Area', 'Kg', 'Rate/kg', 'Amount', 'Payment']],
      body: body.length ? body : [['', 'No orders recorded', '', '', '', '', '']],
      foot: body.length ? [['', 'Total', '', kg1(T.kg), '', rs(T.revenue), '']] : undefined,
      columnStyles: { 0: { cellWidth: 9 }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } },
      didParseCell: colorStatus(6, payColor)
    })
  } else {
    section('Day-wise orders, expenses and payment status', 60)
    table({
      head: [['Date', 'Orders', 'Kg', 'Sales', 'Batter', 'Driver', 'Diesel', 'Porter', 'Other', 'Net', 'Paid', 'Pending', 'Payment']],
      body: rows.map((r) => [
        fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' }),
        r.count,
        Math.round(r.kg * 10) / 10,
        rs(r.revenue),
        rs(r.batter),
        rs(r.driver),
        rs(r.diesel),
        rs(r.porter),
        rs(r.other),
        rs(r.net, true),
        rs(r.paid),
        rs(r.due),
        PAY_LABEL[r.status]
      ]),
      foot: [['Total', T.orders, Math.round(T.kg * 10) / 10, rs(T.revenue), rs(T.batter), rs(T.driver), rs(T.diesel), rs(T.porter), rs(T.other), rs(T.net, true), rs(T.paid), rs(T.due), '']],
      styles: { fontSize: 7.8, cellPadding: 1.6, lineColor: [225, 228, 238], lineWidth: 0.2, textColor: COL.ink },
      columnStyles: Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((i) => [i, { halign: 'right' }])),
      didParseCell: (hook) => {
        colorStatus(12, payColor)(hook)
        if (hook.section === 'body' && hook.column.index === 9) {
          hook.cell.styles.textColor = String(hook.cell.raw).startsWith('-') ? COL.neg : COL.pos
          hook.cell.styles.fontStyle = 'bold'
        }
      }
    })

    // customer-wise
    const byC = new Map()
    rows.forEach((r) =>
      r.deliveries.forEach((d) => {
        const o = byC.get(d.customerId) || { name: d.customerName, orders: 0, kg: 0, billed: 0, due: 0 }
        o.orders++
        o.kg += d.qty
        o.billed += d.qty * d.rate
        o.due += d.pay.due
        byC.set(d.customerId, o)
      })
    )
    const cust = [...byC.values()].sort((a, b) => b.kg - a.kg)
    section('Customer-wise summary (by kg)', 50)
    table({
      head: [['Customer', 'Orders', 'Kg', 'Billed', 'Unpaid']],
      body: cust.map((c) => [c.name, c.orders, Math.round(c.kg * 10) / 10, rs(c.billed), c.due > 0.5 ? rs(c.due) : 'Paid']),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      didParseCell: (hook) => {
        if (hook.section === 'body' && hook.column.index === 4) {
          hook.cell.styles.textColor = String(hook.cell.raw) === 'Paid' ? COL.pos : COL.neg
          hook.cell.styles.fontStyle = 'bold'
        }
      }
    })
  }

  // ---- management note
  section('Notes for management')
  const notes = []
  notes.push(`${kg1(T.kg)} delivered in ${T.orders} order${T.orders === 1 ? '' : 's'}. Sales ${rs(T.revenue)}, batter cost ${rs(T.batter)}, gross margin ${rs(T.margin)}${T.kg ? ` (${rs(T.margin / T.kg)} per kg)` : ''}.`)
  notes.push(`Delivery expense ${rs(T.logistics)}${T.kg ? ` = ${rs(T.logistics / T.kg)} per kg` : ''}: driver ${rs(T.driver)}, diesel ${rs(T.diesel)}, porter ${rs(T.porter)}, other ${rs(T.other)}.`)
  notes.push(profit ? `Result: PROFIT of ${rs(T.net)} after all delivery expenses.` : `Result: LOSS of ${rs(-T.net)} after delivery expenses.`)
  if (!profit && T.kg && T.margin > 0) {
    const be = T.logistics / (T.margin / T.kg)
    notes.push(`Break-even needs about ${Math.ceil(be)} kg for these expenses; ${Math.ceil(Math.max(0, be - T.kg))} kg more would have covered them.`)
  }
  if (mode !== 'day' && rows.length) {
    const best = rows.reduce((a, r) => (r.net > a.net ? r : a), rows[0])
    const worst = rows.reduce((a, r) => (r.net < a.net ? r : a), rows[0])
    notes.push(`Best day ${fmtDate(best.date, { weekday: 'short', day: 'numeric', month: 'short' })} (${rs(best.net, true)}); toughest day ${fmtDate(worst.date, { weekday: 'short', day: 'numeric', month: 'short' })} (${rs(worst.net, true)}). Loss-making days: ${T.lossDays} of ${T.days}.`)
  }
  notes.push(
    totalPending > 0.5
      ? `Pending collections: ${rs(totalPending)} from ${pending.length} customer${pending.length === 1 ? '' : 's'}${over.length ? `, of which ${over.length} are over their credit limit` : ''}.`
      : 'No pending collections - all customers are paid up.'
  )
  paragraph(notes)

  // ---- pending customers (end of report)
  section(`Pending payments - customers (as on ${fmtDate(todayStr(), { day: 'numeric', month: 'short', year: 'numeric' })})`, 45)
  table({
    head: [['#', 'Customer', 'Area', 'Phone', 'Pending', 'Oldest bill', 'Days', 'Status']],
    body: pending.length
      ? pending.map((d, i) => [i + 1, d.customer.name, d.customer.area || '', d.customer.phone || '', rs(d.outstanding), d.oldest ? fmtDate(d.oldest) : '', d.daysUnpaid, STATUS_TXT[d.status]])
      : [['', 'No pending payments', '', '', '', '', '', '']],
    foot: pending.length ? [['', 'Total pending', '', '', rs(totalPending), '', '', '']] : undefined,
    columnStyles: { 0: { cellWidth: 9 }, 4: { halign: 'right' }, 6: { halign: 'right' } },
    didParseCell: colorStatus(7, dueColor)
  })

  // ---- sign-off
  need(26)
  doc.setDrawColor(...COL.mute)
  doc.setLineWidth(0.3)
  const sw = (W - 2 * M - 12) / 3
  ;['Prepared by', 'Checked by', 'Approved (Management)'].forEach((t, i) => {
    const x = M + i * (sw + 6)
    doc.line(x, y + 14, x + sw, y + 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...COL.mute)
    doc.text(t, x, y + 19)
  })

  // ---- footer on every page
  const n = doc.getNumberOfPages()
  for (let i = 1; i <= n; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...COL.mute)
    doc.text(`${company} Ledger - generated ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}`, M, H - 7)
    doc.text(`Page ${i} of ${n}`, W - M, H - 7, { align: 'right' })
  }
  return { doc, filename: reportFilename(mode, start, end), summary: { ...T, pending: totalPending, start, end } }
}

export async function sharePdf(doc, filename, text) {
  const file = new File([doc.output('blob')], filename, { type: 'application/pdf' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename, text })
      return 'shared'
    } catch (e) {
      if (e.name === 'AbortError') return 'cancelled'
    }
  }
  doc.save(filename)
  return 'downloaded'
}
