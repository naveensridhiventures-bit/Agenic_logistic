// Quick order: read a pasted order list (name, phone, address, lat/lng, kg, amount) and match it to customers.
import { cleanPhone, titleCase } from './csv'
import { hasLL } from './geo'

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
const words = (s) => new Set(norm(s).split(' ').filter((w) => w.length > 2 && !/^\d+$/.test(w) && !['hotel', 'mess', 'the'].includes(w)))
const NOISE = /^(✓|✔|del|edit|maps\s*↗?|maps|download invoice|pending|✅\s*completed|completed|cash|upi|gpay|paid)$/i
const COORD = /^(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)$/
const KG = /^(\d+(?:\.\d+)?)\s*kgs?$/i
const r2 = (n) => Math.round(n * 100) / 100

export function parseOrderPaste(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const items = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(KG)
    if (!m) continue
    const qty = Number(m[1])
    let amount = 0
    for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
      const a = lines[j].match(/^₹\s*([\d,]+(?:\.\d+)?)$/)
      if (a) {
        amount = Number(a[1].replace(/,/g, ''))
        break
      }
      if (KG.test(lines[j])) break
    }
    let k = i - 1
    let lat
    let lng
    let address = ''
    const c = lines[k]?.match(COORD)
    if (c) {
      lat = Number(c[1])
      lng = Number(c[2])
      k--
    }
    if (lines[k]?.startsWith('📍')) {
      address = lines[k].replace(/^📍\s*/, '')
      k--
    }
    while (k >= 0 && NOISE.test(lines[k])) k--
    let phone = ''
    const pm = lines[k]?.match(/^(.*?)\s*·\s*([+\d][\d\s+-]{6,})$/)
    if (pm) {
      phone = cleanPhone(pm[2])
      k--
    }
    while (k >= 0 && (NOISE.test(lines[k]) || /^\d{1,3}$/.test(lines[k]))) k--
    const name = lines[k]
    if (!name || KG.test(name)) continue
    items.push({ name: titleCase(name), phone, address, lat, lng, qty, rate: qty > 0 && amount > 0 ? r2(amount / qty) : 0, amount })
  }
  if (items.length) return items
  // simple fallback: "Hotel name - 10kg" / "Hotel name 10" / "Hotel name, 10"
  for (const l of lines) {
    const m = l.match(/^(.+?)[\s:,\-–]+(\d+(?:\.\d+)?)\s*(?:kgs?)?$/i)
    if (m && /[a-z]/i.test(m[1])) items.push({ name: titleCase(m[1].trim()), phone: '', address: '', qty: Number(m[2]), rate: 0, amount: 0 })
  }
  return items
}

/** Attach the best matching customer (or null) to each item; a customer is used once. */
export function matchItems(items, customers) {
  const used = new Set()
  const phoneCount = {}
  customers.forEach((c) => {
    const p = cleanPhone(c.phone)
    if (p) phoneCount[p] = (phoneCount[p] || 0) + 1
  })
  return items.map((it) => {
    const iw = words(it.name)
    const scored = customers
      .filter((c) => !used.has(c.id))
      .map((c) => {
        let score = 0
        const cn = norm(c.name)
        if (cn && cn === norm(it.name)) score += 100
        const p = cleanPhone(c.phone)
        if (p && it.phone && p === it.phone && phoneCount[p] === 1) score += 60
        let near = false
        if (Number.isFinite(it.lat) && hasLL(c) && Math.hypot(c.lat - it.lat, c.lng - it.lng) * 111 < 0.15) {
          score += 40
          near = true
        }
        const cw = words(c.name)
        let n = 0
        iw.forEach((w) => cw.has(w) && n++)
        score += n * 20
        if (cn && cn.length >= 5 && (norm(it.name).includes(cn) || cn.includes(norm(it.name)))) score += 30
        return { c, score, n, near }
      })
      .filter((x) => x.score >= 60 || (x.n >= 1 && x.score >= 40))
      .sort((a, b) => b.score - a.score || b.n - a.n)
    const best = scored[0]
    if (best) used.add(best.c.id)
    return { ...it, cust: best ? best.c : null }
  })
}
