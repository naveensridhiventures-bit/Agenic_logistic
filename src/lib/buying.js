import { addDays, diffDays, todayStr } from './util'

const WINDOW = 60
const r1 = (n) => Math.round(n * 10) / 10

/**
 * How a customer really buys, from their last 60 days of deliveries:
 * usual qty (the qty they order most often, else the average), orders per week,
 * average kg per order and average kg per calendar day.
 */
export function buyingStats(customerId, data, asOf = todayStr()) {
  const from = addDays(asOf, -(WINDOW - 1))
  const ds = data.deliveries.filter((d) => d.customerId === customerId && d.date >= from && d.date <= asOf && Number(d.qty) > 0)
  if (!ds.length) return null
  const days = new Map()
  ds.forEach((d) => days.set(d.date, (days.get(d.date) || 0) + Number(d.qty)))
  const qtys = [...days.values()]
  const orders = qtys.length
  const kg = qtys.reduce((s, q) => s + q, 0)
  const first = [...days.keys()].sort()[0]
  const span = Math.max(7, Math.min(WINDOW, diffDays(asOf, first) + 1))
  const perWeek = (orders / span) * 7
  const avgOrder = kg / orders
  const perDay = kg / span
  const freq = new Map()
  qtys.forEach((q) => freq.set(q, (freq.get(q) || 0) + 1))
  const [modeQ, modeN] = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]
  const steady = modeN / orders >= 0.4 && orders >= 3
  const usual = steady ? modeQ : Math.round(avgOrder * 2) / 2
  const kind = perWeek >= 6 ? 'Daily' : perWeek >= 3 ? 'Regular' : perWeek >= 0.8 ? 'Weekly' : 'Occasional'
  const freqText = kind === 'Daily' ? 'orders every day' : kind === 'Occasional' ? `${orders} order${orders > 1 ? 's' : ''} in ${span} days` : `~${Math.round(perWeek)} order${Math.round(perWeek) === 1 ? '' : 's'} a week`
  return {
    orders,
    kg: r1(kg),
    span,
    perWeek: r1(perWeek),
    avgOrder: r1(avgOrder),
    perDay: r1(perDay),
    usual,
    steady,
    kind,
    last: [...days.keys()].sort().pop(),
    // one readable line
    text: `${steady ? 'Usually' : 'Averages'} ${r1(usual)} kg - ${freqText} - about ${r1(perDay)} kg/day`
  }
}
