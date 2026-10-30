// Customer groups by how they pay: Cash & carry, Weekly payers, Occasional payers, Risk customers (+ New).
import { unitCostOf } from './calc'
import { addDays, diffDays, sum, todayStr } from './util'

export const SEGMENTS = {
  cash: { key: 'cash', label: 'Cash & carry', short: 'Cash & carry', tone: 'pos', hue: '#22d39a', blurb: 'Pay on delivery or the next day. Safest customers - deliver freely.' },
  weekly: { key: 'weekly', label: 'Weekly payers', short: 'Weekly', tone: 'brand', hue: '#7c5cff', blurb: 'Settle about once a week. Collect on their usual day.' },
  occasional: { key: 'occasional', label: 'Occasional payers', short: 'Occasional', tone: 'warn', hue: '#ffb020', blurb: 'Pay now and then. Keep their credit short.' },
  risk: { key: 'risk', label: 'Risk customers', short: 'Risk', tone: 'bad', hue: '#ff5d73', blurb: 'Overdue or over limit. Collect before the next delivery.' },
  new: { key: 'new', label: 'New / no history', short: 'New', tone: 'mute', hue: '#7f8db5', blurb: 'Not enough orders or payments yet to judge.' }
}
export const SEG_ORDER = ['cash', 'weekly', 'occasional', 'risk', 'new']

const median = (a) => {
  const s = [...a].sort((x, y) => x - y)
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0
}

export function segmentOf(c, data, due, asOf = todayStr()) {
  const since = addDays(asOf, -90)
  const ds = data.deliveries.filter((d) => d.customerId === c.id && d.date <= asOf && d.date >= since)
  const ps = data.payments.filter((p) => p.customerId === c.id && p.date >= since && p.date <= asOf)
  if (!ds.length) return 'new'
  const out = due?.outstanding || 0
  const days = due?.daysUnpaid || 0
  const lastPay = ps.length ? ps.map((p) => p.date).sort().at(-1) : ''
  const recentlyPaid = !!lastPay && diffDays(asOf, lastPay) <= 10
  const overAmount = Number(c.creditLimit) > 0 && out >= Number(c.creditLimit)
  // risk: over the amount limit, or overdue while not actively paying
  if (out > 0.5 && (overAmount || (!recentlyPaid && (due.status === 'breach' || days >= 15 || (!ps.length && days >= 7))))) return 'risk'
  const past = ds.filter((d) => d.date < asOf)
  if (!past.length && !ps.length) return 'new'
  // cash & carry: bills mostly paid on the delivery day or the next day
  const billed = sum(past, (d) => d.qty * d.rate)
  if (billed > 0) {
    const covered = sum(past, (d) => {
      const near = sum(ps.filter((p) => diffDays(p.date, d.date) >= 0 && diffDays(p.date, d.date) <= 1), (p) => p.amount)
      return Math.min(d.qty * d.rate, near)
    })
    if (covered / billed >= 0.6) return 'cash'
  }
  const dates = [...new Set(ps.map((p) => p.date))].sort()
  if (dates.length >= 2) {
    const gaps = dates.slice(1).map((d, i) => diffDays(d, dates[i]))
    const m = median(gaps)
    if (m >= 4 && m <= 10) return 'weekly'
    return 'occasional'
  }
  if (!ps.length) return 'new'
  return 'occasional'
}

/** { byId, groups: { key: { list, kg, profit, billed, outstanding, share } } } with 30-day kg and profit per group. */
export function segmentsFor(data, dues, asOf = todayStr()) {
  const byId = {}
  const groups = Object.fromEntries(SEG_ORDER.map((k) => [k, { list: [], kg: 0, profit: 0, billed: 0, outstanding: 0 }]))
  const from = addDays(asOf, -29)
  for (const d of dues) {
    const k = segmentOf(d.customer, data, d, asOf)
    byId[d.customer.id] = k
    const g = groups[k]
    g.list.push(d)
    g.outstanding += d.outstanding
    const ds = data.deliveries.filter((x) => x.customerId === d.customer.id && x.date >= from && x.date <= asOf)
    g.kg += sum(ds, (x) => x.qty)
    g.billed += sum(ds, (x) => x.qty * x.rate)
    g.profit += sum(ds, (x) => x.qty * (x.rate - unitCostOf(x, data)))
  }
  const total = Math.max(1, SEG_ORDER.reduce((s, k) => s + Math.max(0, groups[k].profit), 0))
  SEG_ORDER.forEach((k) => (groups[k].share = Math.max(0, groups[k].profit) / total))
  return { byId, groups }
}
