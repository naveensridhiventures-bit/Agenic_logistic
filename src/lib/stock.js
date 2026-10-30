// Date-wise stock with FIFO batches. Each day's production is a batch (dated by manufacture day);
// dispatches and waste always use the OLDEST stock first, so leftovers carry over and are shown to be cleared first.
import { addDays, diffDays, sum, todayStr } from './util'

export const STOCK_TYPES = ['produce', 'dispatch', 'waste']
export const stockId = (date, productId, type) => `${date}|${productId}|${type}`
const r1 = (n) => Math.round((Number(n) || 0) * 100) / 100

export const packets = (kg, product) => {
  const p = Number(product?.packetKg) || 0
  return p > 0 ? Math.round((Number(kg) || 0) / p) : null
}
export const packetText = (kg, product) => {
  const n = packets(kg, product)
  return n == null ? '' : `${n} packet${n === 1 ? '' : 's'}`
}

/** Replay every entry of one product day by day. Returns days[] ascending and a per-date lookup. */
export function replay(productId, data, upTo) {
  const rows = (data.stock || []).filter((s) => s.productId === productId && s.date <= upTo)
  if (!rows.length) return { days: [], byDate: {}, batches: [] }
  const dates = [...new Set(rows.map((r) => r.date))].sort()
  const first = dates[0]
  const batches = [] // { date, kg } oldest first
  const days = []
  const byDate = {}
  for (let d = first; d <= upTo; d = addDays(d, 1)) {
    const todays = rows.filter((r) => r.date === d)
    const get = (t) => sum(todays.filter((r) => r.type === t), (r) => r.kg)
    const opening = sum(batches, (b) => b.kg)
    const carry = batches.filter((b) => b.kg > 0.001).map((b) => ({ date: b.date, kg: r1(b.kg) }))
    const produced = get('produce')
    if (produced > 0) batches.push({ date: d, kg: produced })
    const alloc = []
    let short = 0
    for (const [type, qty] of [['dispatch', get('dispatch')], ['waste', get('waste')]]) {
      let need = qty
      for (const b of batches) {
        if (need <= 0.0001) break
        const use = Math.min(b.kg, need)
        if (use > 0) {
          b.kg -= use
          need -= use
          alloc.push({ type, batchDate: b.date, kg: r1(use) })
        }
      }
      if (need > 0.0001) short += need
    }
    const closingBatches = batches.filter((b) => b.kg > 0.001).map((b) => ({ date: b.date, kg: r1(b.kg) }))
    const day = {
      date: d,
      opening: r1(opening),
      carry,
      produced: r1(produced),
      dispatched: r1(get('dispatch')),
      waste: r1(get('waste')),
      short: r1(short),
      closing: r1(sum(closingBatches, (b) => b.kg)),
      closingBatches,
      alloc,
      note: todays.map((t) => t.note).filter(Boolean).join(' / ')
    }
    days.push(day)
    byDate[d] = day
  }
  return { days, byDate, batches: batches.filter((b) => b.kg > 0.001) }
}

/** State for one date: what is left from earlier days (clear first) + that day's numbers. */
export function dayStock(product, date, data) {
  const { byDate, days } = replay(product.id, data, date)
  const today = byDate[date]
  const prev = days.filter((d) => d.date < date).at(-1)
  const carry = prev ? prev.closingBatches : []
  const empty = { date, opening: sum(carry, (b) => b.kg), carry, produced: 0, dispatched: 0, waste: 0, short: 0, closing: sum(carry, (b) => b.kg), closingBatches: carry, alloc: [], note: '' }
  return { ...(today ? { ...today, carry: today.carry } : empty), carry: today ? today.carry : carry }
}

export const ageOf = (batchDate, date) => Math.max(0, diffDays(date, batchDate))

/** Suggested production for `forDate` so we make just enough: demand (+ safety buffer) minus what is already left. */
export function suggestProduction(product, forDate, data) {
  const before = replay(product.id, data, addDays(forDate, -1))
  const carryBatches = before.batches
  const shelf = Number(product.shelfDays) || 0
  const usable = carryBatches.filter((b) => !shelf || ageOf(b.date, forDate) < shelf)
  const expired = carryBatches.filter((b) => shelf && ageOf(b.date, forDate) >= shelf)
  const carry = sum(usable, (b) => b.kg)
  // demand: orders already entered for that date (main product) else average of recent dispatches
  const recent = before.days.filter((d) => d.dispatched > 0).slice(-7)
  const avg = recent.length ? sum(recent, (d) => d.dispatched) / recent.length : 0
  const ordered = product.main ? sum(data.deliveries.filter((d) => d.date === forDate), (d) => d.qty) : 0
  const demand = ordered > 0 ? ordered : avg
  const source = ordered > 0 ? 'orders' : avg > 0 ? 'average' : 'none'
  const buffer = Number(product.buffer) || 0
  const target = demand * (1 + buffer / 100)
  let make = Math.max(0, target - carry)
  const pk = Number(product.packetKg) || 0
  if (pk > 0) make = Math.ceil(make / pk - 1e-9) * pk
  else make = Math.ceil(make)
  return { carry: r1(carry), expired: r1(sum(expired, (b) => b.kg)), expiredBatches: expired, demand: r1(demand), ordered: r1(ordered), avg: r1(avg), source, buffer, target: r1(target), make: r1(make), samples: recent.length }
}

export function stockSummaryRange(product, from, to, data) {
  const { days } = replay(product.id, data, to)
  return days.filter((d) => d.date >= from && d.date <= to && (d.produced || d.dispatched || d.waste || d.opening)).reverse()
}

export const stockToday = todayStr
