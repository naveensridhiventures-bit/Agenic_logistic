import { addDays, diffDays, fmtDate, inr, parse, sum, toStr, todayStr } from './util'

export const DEFAULT_SETTINGS = {
  company: 'Agenic',
  costPerKg: 0, // what one kg of batter costs you to make - set in Settings
  defaultRate: 40, // default selling price per kg
  defaultProfitPerKg: 0, // your profit per kg when a customer has none set
  depotName: 'Koratturr', // pickup point every route starts from and returns to
  depotLat: 13.1143,
  depotLng: 80.185,
  mileageKmpl: 12, // truck km per litre
  dieselPrice: 95, // rupees per litre
  driverPerDay: 0, // default driver salary pre-filled each day
  ownerEmail: '',
  maxUnpaidDays: 3, // warn when a customer's oldest bill is this many days old
  warnPercent: 80 // "near limit" threshold (% of credit limit)
}

/**
 * Cost of one kg for a customer = selling rate - the profit per kg you set for that customer.
 * (The Rs.40 price includes manufacturing and other costs; only the profit is entered.)
 */
export function costFor(customer, settings, rate) {
  const r = Number(rate) || Number(customer?.rate) || Number(settings.defaultRate) || 0
  const own = Number(customer?.profitPerKg) || 0
  const p = own > 0 ? own : Number(settings.defaultProfitPerKg) || 0
  if (p > 0) return Math.max(0, r - p)
  return Number(settings.costPerKg) || 0
}
export const unitCostOf = (d, data) =>
  Number(d.cost) || costFor(data.customers.find((c) => c.id === d.customerId), data.settings, d.rate)

/** Profit / loss for one day. */
export function dayStats(date, data) {
  const { deliveries, costs, payments, settings } = data
  const ds = deliveries.filter((d) => d.date === date)
  const kg = sum(ds, (d) => d.qty)
  const revenue = sum(ds, (d) => d.qty * d.rate)
  const batter = sum(ds, (d) => d.qty * unitCostOf(d, data))
  const c = costs.find((x) => x.date === date) || {}
  const driver = Number(c.driver) || 0
  const diesel = Number(c.diesel) || 0
  const legacyPorter = Number(c.porter) || 0
  const trips = (data.trips || [])
    .filter((t) => t.date === date)
    .map((t) => {
      const ids = String(t.customerIds || '').split(',').filter(Boolean)
      const hotels = ids.map((id) => ({
        id,
        name: data.customers.find((x) => x.id === id)?.name || ds.find((d) => d.customerId === id)?.customerName || id,
        kg: sum(ds.filter((d) => d.customerId === id), (d) => d.qty)
      }))
      const tkg = sum(hotels, (h) => h.kg)
      return { ...t, hotels, kg: tkg, perKg: tkg ? t.cost / tkg : 0 }
    })
  const hired = sum(trips, (t) => t.cost)
  const hiredKg = sum(trips, (t) => t.kg)
  const porter = legacyPorter + hired
  const other = Number(c.other) || 0
  const logistics = driver + diesel + porter + other
  const margin = revenue - batter
  const net = margin - logistics
  const marginPerKg = kg ? margin / kg : 0
  const breakEvenKg = marginPerKg > 0 ? logistics / marginPerKg : null
  return {
    date,
    count: ds.length,
    kg,
    revenue,
    batter,
    margin,
    marginPerKg,
    driver,
    diesel,
    porter,
    legacyPorter,
    trips,
    hired,
    hiredKg,
    other,
    logistics,
    net,
    logisticsPerKg: kg ? logistics / kg : 0,
    breakEvenKg,
    shortKg: breakEvenKg != null ? Math.max(0, breakEvenKg - kg) : null,
    collected: sum(payments.filter((p) => p.date === date), (p) => p.amount),
    hasCosts: !!c.date || trips.length > 0,
    empty: ds.length === 0 && !c.date && !trips.length
  }
}

export function trendData(data, endDate, days = 7) {
  const out = []
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(endDate, -i)
    const s = dayStats(date, data)
    out.push({ date, net: s.net, revenue: s.revenue, empty: s.empty })
  }
  return out
}

/**
 * Outstanding per customer. Payments are applied to the OLDEST bills first (FIFO),
 * so "days unpaid" always means the age of the oldest bill that is still open.
 */
export function computeDues(data, asOf = todayStr()) {
  const { customers, payments, settings } = data
  const deliveries = data.deliveries.filter((d) => d.date <= asOf)
  const rows = customers
    .filter((c) => c.active !== false)
    .map((c) => {
      const ds = deliveries
        .filter((d) => d.customerId === c.id)
        .sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
      let credit = sum(payments.filter((p) => p.customerId === c.id), (p) => p.amount)
      const billed = sum(ds, (d) => d.qty * d.rate)
      const paid = credit
      const unpaid = []
      for (const d of ds) {
        const amt = d.qty * d.rate
        const used = Math.min(credit, amt)
        credit -= used
        const left = amt - used
        if (left > 0.5) unpaid.push({ date: d.date, qty: d.qty, amount: amt, due: left })
      }
      const outstanding = unpaid.reduce((s, u) => s + u.due, 0)
      const oldest = unpaid[0]?.date
      const daysUnpaid = oldest ? Math.max(0, diffDays(asOf, oldest)) : 0
      const limit = Number(c.creditLimit) || 0
      const maxDays = Number(c.maxDays) || Number(settings.maxUnpaidDays) || 0
      const usage = limit ? outstanding / limit : 0
      const overAmount = limit > 0 && outstanding >= limit
      const overDays = maxDays > 0 && outstanding > 0 && daysUnpaid >= maxDays
      const nearAmount = limit > 0 && usage >= (Number(settings.warnPercent) || 80) / 100
      const nearDays = maxDays > 1 && outstanding > 0 && daysUnpaid >= maxDays - 1
      const reasons = []
      if (overAmount) reasons.push(`Outstanding ${inr(outstanding)} reached the ${inr(limit)} limit`)
      if (overDays) reasons.push(`Oldest bill unpaid for ${daysUnpaid} days (limit ${maxDays})`)
      let status = 'clear'
      if (outstanding > 0.5) status = 'ok'
      if (nearAmount || nearDays) status = 'warn'
      if (overAmount || overDays) status = 'breach'
      return {
        customer: c,
        billed,
        paid,
        outstanding,
        advance: Math.max(0, credit),
        unpaid,
        oldest,
        daysUnpaid,
        limit,
        maxDays,
        usage,
        status,
        reasons
      }
    })
  const rank = { breach: 0, warn: 1, ok: 2, clear: 3 }
  return rows.sort(
    (a, b) => rank[a.status] - rank[b.status] || b.outstanding - a.outstanding
  )
}

/** Professional reminder text (the Apps Script wraps it in an HTML template). */
export function buildReminder(item, settings) {
  const c = item.customer
  const lines = item.unpaid.map(
    (u) => `  ${fmtDate(u.date, { day: 'numeric', month: 'short', year: 'numeric' })}  -  ${u.qty} kg batter  -  ${inr(u.due)}`
  )
  const subject = `Payment reminder: ${inr(item.outstanding)} outstanding | ${settings.company || 'Agenic'}`
  const body = [
    `Dear ${c.name} team,`,
    '',
    `This is a gentle reminder that the following idli batter invoices are still open with ${settings.company || 'Agenic'}:`,
    '',
    ...lines,
    '',
    `Total outstanding: ${inr(item.outstanding)}`,
    item.daysUnpaid ? `Oldest bill is ${item.daysUnpaid} day(s) old.` : '',
    '',
    'Kindly arrange the payment at the earliest by cash, UPI or bank transfer. If you have already paid, please ignore this message or reply with the payment reference so we can update our records.',
    '',
    'Thank you for your continued business.',
    '',
    `Warm regards,`,
    `Accounts - ${settings.company || 'Agenic'}`
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
  return { subject, body }
}

/* ---------------- payment status per delivery + period reports ---------------- */

/** Payments clear each customer's OLDEST bills first. Returns { [deliveryId]: {amount, paid, due, status} }. */
export function deliveryPayStatus(data) {
  const out = {}
  const byC = {}
  data.deliveries.filter((d) => d.date <= todayStr()).forEach((d) => (byC[d.customerId] ||= []).push(d))
  const paidBy = {}
  data.payments.forEach((p) => (paidBy[p.customerId] = (paidBy[p.customerId] || 0) + (Number(p.amount) || 0)))
  for (const [cid, ds] of Object.entries(byC)) {
    ds.sort((a, b) => a.date.localeCompare(b.date) || String(a.id).localeCompare(String(b.id)))
    let credit = paidBy[cid] || 0
    for (const d of ds) {
      const amount = d.qty * d.rate
      const used = Math.min(credit, amount)
      credit -= used
      const due = amount - used
      out[d.id] = { amount, paid: used, due, status: due <= 0.5 ? 'paid' : used > 0.5 ? 'part' : 'pending' }
    }
  }
  return out
}
export const PAY_LABEL = { paid: 'Paid', part: 'Part paid', pending: 'Pending', none: '-' }
export const PAY_CHIP = { paid: 'clear', part: 'warn', pending: 'breach', none: '' }

export function periodRange(mode, anchor) {
  if (mode === 'day') return { start: anchor, end: anchor }
  const d = parse(anchor)
  if (mode === 'week') {
    const start = addDays(anchor, -((d.getDay() + 6) % 7)) // Monday
    return { start, end: addDays(start, 6) }
  }
  return {
    start: toStr(new Date(d.getFullYear(), d.getMonth(), 1)),
    end: toStr(new Date(d.getFullYear(), d.getMonth() + 1, 0))
  }
}
export function shiftPeriod(mode, anchor, n) {
  if (mode === 'day') return addDays(anchor, n)
  if (mode === 'week') return addDays(anchor, 7 * n)
  const d = parse(anchor)
  return toStr(new Date(d.getFullYear(), d.getMonth() + n, 1))
}
export function periodLabel(mode, start, end) {
  if (mode === 'day') return fmtDate(start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  if (mode === 'month') return parse(start).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
  return `${fmtDate(start, { day: 'numeric', month: 'short' })} - ${fmtDate(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

/** One row per day that has entries, newest first (future days are skipped). */
export function periodRows(start, end, data, pay) {
  const rows = []
  const last = end > todayStr() ? todayStr() : end
  for (let d = last; d >= start; d = addDays(d, -1)) {
    const s = dayStats(d, data)
    if (s.empty) continue
    const deliveries = data.deliveries
      .filter((x) => x.date === d)
      .map((x) => ({ ...x, pay: pay[x.id] || { amount: x.qty * x.rate, paid: 0, due: x.qty * x.rate, status: 'pending' } }))
    const billed = sum(deliveries, (x) => x.pay.amount)
    const paid = sum(deliveries, (x) => x.pay.paid)
    const due = sum(deliveries, (x) => x.pay.due)
    const status = !deliveries.length ? 'none' : due <= 0.5 ? 'paid' : paid > 0.5 ? 'part' : 'pending'
    const cost = data.costs.find((c) => c.date === d)
    deliveries.forEach((x) => (x.profit = x.qty * (x.rate - unitCostOf(x, data))))
    rows.push({ ...s, deliveries, billed, paid, due, status, costNote: cost?.note || '' })
  }
  return rows
}

export function sumRows(rows) {
  const t = (k) => sum(rows, (r) => r[k])
  return {
    days: rows.length,
    orders: t('count'),
    kg: t('kg'),
    revenue: t('revenue'),
    batter: t('batter'),
    margin: t('margin'),
    driver: t('driver'),
    diesel: t('diesel'),
    porter: t('porter'),
    hired: t('hired'),
    hiredKg: t('hiredKg'),
    other: t('other'),
    logistics: t('logistics'),
    net: t('net'),
    billed: t('billed'),
    paid: t('paid'),
    due: t('due'),
    collected: t('collected'),
    lossDays: rows.filter((r) => r.net < 0).length
  }
}
