// Map helpers: coordinates, Google plus codes, Maps links, geocoding, route ordering.
export const CHENNAI = { lat: 13.0827, lng: 80.2707 }
const ROAD_FACTOR = 1.35 // straight line -> typical city road distance
const SPEED_KMH = 20 // average city delivery speed
const SERVICE_MIN = 6 // minutes spent at each stop

export const hasLL = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)

export function haversine(a, b) {
  const R = 6371
  const rad = (x) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}
export const roadKm = (a, b) => haversine(a, b) * ROAD_FACTOR

/* ---------------- Open Location Code (Google plus codes) ---------------- */
const ALPH = '23456789CFGHJMPQRVWX'
const idx = (ch) => ALPH.indexOf(ch)

export function olcDecode(full) {
  const c = full.replace('+', '').toUpperCase()
  let latLo = -90
  let lngLo = -180
  let res = 20
  const pairLen = Math.min(c.length, 10)
  for (let i = 0; i < pairLen; i += 2) {
    latLo += idx(c[i]) * res
    lngLo += idx(c[i + 1]) * res
    if (i + 2 < pairLen) res /= 20
  }
  let latSize = res
  let lngSize = res
  for (let i = 10; i < c.length; i++) {
    const d = idx(c[i])
    latSize /= 5
    lngSize /= 4
    latLo += Math.floor(d / 4) * latSize
    lngLo += (d % 4) * lngSize
  }
  return { lat: latLo + latSize / 2, lng: lngLo + lngSize / 2 }
}

function olcPrefix(lat, lng, chars) {
  let la = lat + 90
  let ln = lng + 180
  let res = 20
  let out = ''
  for (let k = 0; k < chars / 2; k++) {
    const a = Math.floor(la / res)
    const b = Math.floor(ln / res)
    out += ALPH[a] + ALPH[b]
    la -= a * res
    ln -= b * res
    res /= 20
  }
  return out
}

/** Short code ("X6HM+R7H") -> coordinates nearest to a reference point (default Chennai). */
export function olcRecover(short, ref = CHENNAI) {
  const s = short.toUpperCase()
  const before = s.indexOf('+')
  if (before >= 8) return olcDecode(s)
  const pad = 8 - before
  const resolution = 20 ** (2 - pad / 2)
  const half = resolution / 2
  const p = olcDecode(olcPrefix(ref.lat, ref.lng, pad) + s)
  let { lat, lng } = p
  if (ref.lat + half < lat && lat - resolution >= -90) lat -= resolution
  else if (ref.lat - half > lat && lat + resolution <= 90) lat += resolution
  if (ref.lng + half < lng) lng -= resolution
  else if (ref.lng - half > lng) lng += resolution
  return { lat, lng }
}

const PLUS_RE = /\b([23456789CFGHJMPQRVWX]{2,8})\+([23456789CFGHJMPQRVWX]{2,3})/i

/**
 * Understands: "13.0827, 80.2707", Google Maps links (@lat,lng / q=lat,lng / !3d..!4d),
 * and plus codes (full or short). Returns { lat, lng, source } or null.
 */
export function parseLocation(text, ref = CHENNAI) {
  const t = String(text || '').trim()
  if (!t) return null
  const ok = (lat, lng, source) => {
    lat = Number(lat)
    lng = Number(lng)
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng, source } : null
  }
  let m = t.match(/^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/)
  if (m) return ok(m[1], m[2], 'manual')
  let dec = t
  try {
    dec = decodeURIComponent(t)
  } catch {
    /* keep raw */
  }
  m = dec.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || dec.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || dec.match(/[?&](?:q|query|ll|destination|center)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/)
  if (m) return ok(m[1], m[2], 'manual')
  m = t.match(PLUS_RE)
  if (m) {
    const code = `${m[1]}+${m[2]}`
    const p = m[1].length >= 8 ? olcDecode(code) : olcRecover(code, ref)
    // plus codes are only trusted when they land in the Tamil Nadu / south India box
    if (p.lat > 7 && p.lat < 15 && p.lng > 76 && p.lng < 81) return { ...p, source: 'plus' }
  }
  return null
}

/* ---------------- geocoding (OpenStreetMap Nominatim, runs in the browser) ---------------- */
export async function nominatim(q, signal) {
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&addressdetails=0' +
    '&viewbox=79.9,13.4,80.5,12.6&q=' +
    encodeURIComponent(q)
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Map search failed (${res.status})`)
  const j = await res.json()
  if (!j.length) return null
  return { lat: Number(j[0].lat), lng: Number(j[0].lon) }
}

/** Try the address in several forms, from most to least precise. */
export async function geocodeCustomer(c, signal) {
  const addr = (c.address || '').trim()
  const tail = addr.split(',').map((s) => s.trim()).filter(Boolean).slice(-4).join(', ')
  const tries = []
  if (addr) tries.push([addr, 'geocode'])
  if (tail && tail !== addr) tries.push([tail, 'geocode'])
  tries.push([`${c.name}, ${c.area || 'Chennai'}, Tamil Nadu`, 'geocode'])
  if (c.area) tries.push([`${c.area}, Chennai, Tamil Nadu`, 'approx'])
  for (const [q, source] of tries) {
    const p = await nominatim(q, signal)
    await new Promise((r) => setTimeout(r, 1100)) // Nominatim fair-use: 1 request / second
    if (p) {
      const far = haversine(p, CHENNAI) > 70
      return { ...p, source: far ? 'approx' : source }
    }
  }
  return null
}

/* ---------------- route maths ---------------- */
// With a pickup point every route is a loop: pickup -> stops -> back to pickup.
export function pathKm(start, stops, ret = false) {
  let km = 0
  const s0 = hasLL(start) ? start : null
  let prev = s0
  for (const s of stops) {
    if (!hasLL(s)) continue
    if (prev) km += roadKm(prev, s)
    prev = s
  }
  if (ret && s0 && prev && prev !== s0) km += roadKm(prev, s0)
  return km
}
export function routeMetrics(start, stops) {
  const km = pathKm(start, stops, true)
  const missing = stops.filter((s) => !hasLL(s)).length
  return { km, minutes: (km / SPEED_KMH) * 60 + stops.length * SERVICE_MIN, missing }
}
export const fmtDur = (min) => {
  const m = Math.round(min)
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`
}
/** Diesel for a distance: litres and rupees. */
export function dieselFor(km, settings) {
  const mileage = Number(settings?.mileageKmpl) || 0
  const price = Number(settings?.dieselPrice) || 0
  const litres = mileage > 0 ? km / mileage : 0
  return { litres, cost: litres * price, ok: mileage > 0 }
}
/** Kg-km: distance weighted by the load still on the truck. Lower = less fuel (heavy drops come first). */
export function loadCost(start, stops) {
  let load = stops.reduce((a, x) => a + (Number(x.kg) || 0), 0)
  let prev = hasLL(start) ? start : null
  let c = 0
  for (const s of stops) {
    if (!hasLL(s)) {
      load -= Number(s.kg) || 0
      continue
    }
    if (prev) c += roadKm(prev, s) * (load + 30) // +30 kg stands for the empty truck and driver
    load -= Number(s.kg) || 0
    prev = s
  }
  return c
}

/**
 * Diesel-saving order. With a pickup point it builds a closed loop (nearest neighbour + 2-opt + or-opt),
 * so the far run goes out one way and the nearer hotels are served on the way back.
 * Of the two directions it keeps the one that drops the heavy loads first.
 * Stops without coordinates go last.
 */
export function optimizeOrder(start, stops) {
  const withC = stops.filter(hasLL)
  const without = stops.filter((s) => !hasLL(s))
  if (withC.length < 2) return [...withC, ...without]
  const hasStart = hasLL(start)
  const S = hasStart ? start : null
  const len = (o) => pathKm(S, o, true)
  let best = null
  const seeds = hasStart ? [null] : withC.map((_, i) => i)
  for (const si of seeds) {
    const left = [...withC]
    const order = []
    let cur = S
    if (!hasStart) {
      cur = left.splice(si, 1)[0]
      order.push(cur)
    }
    while (left.length) {
      let bi = 0
      let bd = Infinity
      left.forEach((p, i) => {
        const d = roadKm(cur, p)
        if (d < bd) {
          bd = d
          bi = i
        }
      })
      cur = left.splice(bi, 1)[0]
      order.push(cur)
    }
    let improved = true
    let guard = 0
    while (improved && guard++ < 80) {
      improved = false
      const base = len(order)
      for (let i = 0; i < order.length - 1 && !improved; i++) {
        for (let j = i + 1; j < order.length; j++) {
          const cand = [...order.slice(0, i), ...order.slice(i, j + 1).reverse(), ...order.slice(j + 1)]
          if (len(cand) + 1e-9 < base) {
            order.splice(0, order.length, ...cand)
            improved = true
            break
          }
        }
      }
      if (!improved) {
        // or-opt: move one stop somewhere else
        for (let i = 0; i < order.length && !improved; i++) {
          const one = order[i]
          const rest = [...order.slice(0, i), ...order.slice(i + 1)]
          for (let j = 0; j <= rest.length; j++) {
            if (j === i) continue
            const cand = [...rest.slice(0, j), one, ...rest.slice(j)]
            if (len(cand) + 1e-9 < base) {
              order.splice(0, order.length, ...cand)
              improved = true
              break
            }
          }
        }
      }
    }
    const L = len(order)
    if (!best || L < best.L) best = { order, L }
  }
  let order = best.order
  if (hasStart) {
    const rev = [...order].reverse()
    if (loadCost(S, rev) + 1e-9 < loadCost(S, order)) order = rev
  }
  return [...order, ...without]
}

/** Cheapest place to add a stop (the route returns to the pickup point, so the last leg counts too). */
export function bestInsertion(start, stops, p) {
  const route = stops.filter(hasLL)
  const s = hasLL(start) ? start : null
  if (!hasLL(p)) return { pos: stops.length, extraKm: null }
  if (!route.length) return { pos: 0, extraKm: s ? 2 * roadKm(s, p) : 0 }
  let best = { pos: 0, extraKm: Infinity }
  for (let i = 0; i <= route.length; i++) {
    const prev = i === 0 ? s : route[i - 1]
    const next = i < route.length ? route[i] : s
    let extra
    if (prev && next) extra = roadKm(prev, p) + roadKm(p, next) - roadKm(prev, next)
    else if (prev) extra = roadKm(prev, p)
    else extra = roadKm(p, next) // new first stop, no pickup point
    if (extra < best.extraKm) best = { pos: i, extraKm: extra }
  }
  return best
}

/** Google Maps directions links, in chunks of 9 stops. The last link returns to the pickup point. */
export function mapsLinks(start, stops, size = 9, back = true) {
  const pt = (s) => (hasLL(s) ? `${s.lat},${s.lng}` : s.address ? s.address : '')
  const usable = stops.filter((s) => pt(s))
  const links = []
  let origin = start && pt(start) ? pt(start) : ''
  for (let i = 0; i < usable.length; i += size) {
    const chunk = usable.slice(i, i + size)
    const lastChunk = i + size >= usable.length
    const goHome = back && lastChunk && origin && pt(start)
    const pts = goHome ? [...chunk, start] : chunk
    const dest = pt(pts[pts.length - 1])
    const way = pts.slice(0, -1).map(pt).join('|')
    let url = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(dest)}`
    if (origin) url += `&origin=${encodeURIComponent(origin)}`
    if (way) url += `&waypoints=${encodeURIComponent(way)}`
    links.push({ url, from: i + 1, to: i + chunk.length, home: !!goHome })
    origin = pt(chunk[chunk.length - 1])
  }
  return links
}
export const mapsStopUrl = (s) =>
  hasLL(s)
    ? `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${s.lat},${s.lng}`
    : `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(s.address || s.name || '')}`

/** Road-network ordering from the public OSRM server. Throws if unreachable (caller falls back to optimizeOrder). */
export async function osrmOrder(start, stops, signal) {
  const pts = stops.filter(hasLL)
  if (pts.length < 2) return stops
  const all = hasLL(start) ? [start, ...pts] : pts
  if (all.length > 90) throw new Error('too many stops for OSRM')
  const coords = all.map((p) => `${p.lng},${p.lat}`).join(';')
  const url = `https://router.project-osrm.org/trip/v1/driving/${coords}?source=first&roundtrip=true&overview=false`
  const res = await fetch(url, { signal })
  const j = await res.json()
  if (j.code !== 'Ok') throw new Error(j.message || 'OSRM could not route these stops')
  const order = j.waypoints.map((w, i) => ({ i, k: w.waypoint_index })).sort((a, b) => a.k - b.k).map((o) => all[o.i])
  let ordered = hasLL(start) ? order.slice(1) : order
  if (hasLL(start)) {
    const rev = [...ordered].reverse()
    if (loadCost(start, rev) + 1e-9 < loadCost(start, ordered)) ordered = rev
  }
  return [...ordered, ...stops.filter((s) => !hasLL(s))]
}
