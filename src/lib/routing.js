// Driver allocation: suggestions, auto-allocation and per-day route building.
import { bestInsertion, hasLL, optimizeOrder, routeMetrics } from './geo'

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
export const keywords = (text) =>
  String(text || '')
    .split(/[,;\n/|]+/)
    .map(norm)
    .filter((k) => k.length >= 3)

export const driverStart = (d) => (hasLL({ lat: d.startLat, lng: d.startLng }) ? { lat: d.startLat, lng: d.startLng } : null)

/** A delivery joined with its customer so it can be used as a map stop. */
export function stopOf(delivery, customer) {
  return {
    ...delivery,
    id: delivery.id,
    name: customer?.name || delivery.customerName,
    area: customer?.area || '',
    address: customer?.address || '',
    phone: customer?.phone || '',
    lat: customer?.lat,
    lng: customer?.lng,
    locSource: customer?.locSource || '',
    kg: Number(delivery.qty) || 0
  }
}

/** Orders of one date split into per-driver routes (sorted by stop number) and an unassigned list. */
export function routesForDate(date, data) {
  const cById = new Map(data.customers.map((c) => [c.id, c]))
  const drivers = data.drivers.filter((d) => d.active !== false)
  const ids = new Set(drivers.map((d) => d.id))
  const todays = data.deliveries.filter((d) => d.date === date).map((d) => stopOf(d, cById.get(d.customerId)))
  const routes = Object.fromEntries(drivers.map((d) => [d.id, []]))
  const unassigned = []
  for (const s of todays) (s.driverId && ids.has(s.driverId) ? routes[s.driverId] : unassigned).push(s)
  for (const k of Object.keys(routes)) routes[k].sort((a, b) => (Number(a.seq) || 999) - (Number(b.seq) || 999))
  return { drivers, routes, unassigned }
}

/** Rank drivers for one order. Lower score = better. */
export function suggest(stop, drivers, routes) {
  const out = drivers.map((d) => {
    const route = routes[d.id] || []
    const load = route.reduce((s, x) => s + x.kg, 0)
    const cap = Number(d.capacityKg) || 0
    const after = load + stop.kg
    const over = cap > 0 && after > cap
    const start = driverStart(d)
    const ins = bestInsertion(start, route, stop)
    const kw = keywords(d.stretch)
    const hay = norm(`${stop.area} ${stop.address}`)
    const stretchHit = kw.find((k) => hay.includes(k))
    const sameArea = stop.area && route.find((r) => norm(r.area) === norm(stop.area))
    const known = ins.extraKm != null && (start || route.some(hasLL))
    let score = known ? ins.extraKm : 10
    if (stretchHit) score -= 3
    if (sameArea) score -= 3
    score += after * 0.03 // gentle load balancing
    if (over) score += 500
    const reasons = []
    if (sameArea) reasons.push(`Same area as stop ${route.indexOf(sameArea) + 1} (${sameArea.area})`)
    if (stretchHit) reasons.push(`On stretch: ${stretchHit}`)
    if (known) reasons.push(route.length ? `+${ins.extraKm.toFixed(1)} km detour` : `${ins.extraKm.toFixed(1)} km from start`)
    else if (!hasLL(stop)) reasons.push('No map location for this customer')
    else reasons.push('No start point / stops with location yet')
    if (over) reasons.push(`Over capacity (${Math.round(after)}/${cap} kg)`)
    return { driver: d, score, extraKm: known ? ins.extraKm : null, pos: ins.pos, load, after, cap, over, reasons, stretchHit: !!stretchHit }
  })
  return out.sort((a, b) => a.score - b.score)
}

/** Insert a stop at a position; returns the new ordered list of full stops (driver + seq set). */
export function placeStop(driver, route, stop, pos) {
  const next = [...route]
  const at = pos == null ? next.length : Math.max(0, Math.min(pos, next.length))
  // `pos` from bestInsertion counts only stops with coordinates; map it to a real index
  let real = at
  if (pos != null) {
    let seen = 0
    real = next.length
    for (let i = 0; i < next.length; i++) {
      if (seen === at) {
        real = i
        break
      }
      if (hasLL(next[i])) seen++
    }
  }
  next.splice(real, 0, stop)
  return next.map((x, i) => ({ ...x, driverId: driver.id, seq: i + 1 }))
}
/** Stops -> plain delivery rows that can be saved to the sheet. */
export const toRows = (stops) => stops.map(stripStop)
export function renumber(driverId, stops) {
  return stops.map((s, i) => ({ ...stripStop(s), driverId, seq: i + 1 }))
}
export function stripStop(s) {
  const { name, area, address, phone, lat, lng, locSource, kg, ...row } = s // eslint-disable-line no-unused-vars
  return row
}

/** Allocate every unassigned order (biggest first) by cheapest insertion, then tidy each route's order. */
export function autoAllocate(drivers, routes, unassigned) {
  const work = Object.fromEntries(Object.entries(routes).map(([k, v]) => [k, [...v]]))
  const order = [...unassigned].sort((a, b) => b.kg - a.kg)
  const touched = new Set()
  for (const s of order) {
    const best = suggest(s, drivers, work)[0]
    if (!best) break
    work[best.driver.id] = placeStop(best.driver, work[best.driver.id], s, best.pos)
    touched.add(best.driver.id)
  }
  const changed = []
  for (const id of touched) {
    const d = drivers.find((x) => x.id === id)
    const tidy = optimizeOrder(driverStart(d), work[id])
    changed.push(...renumber(id, tidy))
  }
  return changed
}

export const loadOf = (stops) => stops.reduce((s, x) => s + x.kg, 0)
export { routeMetrics }
