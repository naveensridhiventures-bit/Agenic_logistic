import { addDays, diffDays, fmtDate, inr, sum, todayStr } from './util'

export const DEFAULT_SETTINGS = {
  company: 'Agenic',
  costPerKg: 55, // what one kg of batter costs you to make
  defaultRate: 95, // default selling price per kg
  driverPerDay: 700, // default driver salary pre-filled each day
  ownerEmail: '',
  maxUnpaidDays: 3, // warn when a customer's oldest bill is this many days old
  warnPercent: 80 // "near limit" threshold (% of credit limit)
}

/** Profit / loss for one day. */
export function dayStats(date, data) {
  const { deliveries, costs, payments, settings } = data
  const ds = deliveries.filter((d) => d.date === date)
  const kg = sum(ds, (d) => d.qty)
  const revenue = sum(ds, (d) => d.qty * d.rate)
  const batter = sum(ds, (d) => d.qty * (d.cost || settings.costPerKg))
  const c = costs.find((x) => x.date === date) || {}
  const driver = Number(c.driver) || 0
  const diesel = Number(c.diesel) || 0
  const porter = Number(c.porter) || 0
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
    other,
    logistics,
    net,
    logisticsPerKg: kg ? logistics / kg : 0,
    breakEvenKg,
    shortKg: breakEvenKg != null ? Math.max(0, breakEvenKg - kg) : null,
    collected: sum(payments.filter((p) => p.date === date), (p) => p.amount),
    hasCosts: !!c.date,
    empty: ds.length === 0 && !c.date
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
  const { customers, deliveries, payments, settings } = data
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
