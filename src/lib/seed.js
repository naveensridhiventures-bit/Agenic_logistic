// Demo data so the app looks alive before you connect your Google Sheet.
import { addDays, todayStr } from './util'
import { DEFAULT_SETTINGS } from './calc'

function rng(seed) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// name, area, rate/kg, credit limit, payment habit
const HOTELS = [
  ['Sri Murugan Mess', 'Gandhipuram', 108, 15000, 'good'],
  ['Annapoorna Tiffins', 'RS Puram', 104, 20000, 'weekly'],
  ['Hotel Sai Residency', 'Peelamedu', 112, 25000, 'good'],
  ['Green Leaf Restaurant', 'Saibaba Colony', 98, 12000, 'slow'],
  ['Vasantham Cafe', 'Singanallur', 92, 10000, 'good'],
  ['Kovai Kitchen', 'Race Course', 110, 30000, 'weekly'],
  ['Udupi Grand', 'Town Hall', 100, 14000, 'over'],
  ['Tiffin Express', 'Ukkadam', 80, 10000, 'good'],
  ['Sakthi Mess', 'Ganapathy', 88, 12000, 'slow2'],
  ['Lakshmi Bhavan', 'Ramanathapuram', 96, 18000, 'weekly'],
  ['Spice Route Hotel', 'Avinashi Road', 112, 35000, 'good'],
  ['Amma Unavagam', 'Thudiyalur', 72, 8000, 'good']
]

export function seedData() {
  const r = rng(42)
  const today = todayStr()
  const DAYS = 22
  const customers = HOTELS.map((h, i) => ({
    id: `c${i + 1}`,
    name: h[0],
    area: h[1],
    phone: `98${String(40000000 + i * 137531).slice(0, 8)}`,
    email: `accounts${i + 1}@example.com`,
    rate: h[2],
    creditLimit: h[3],
    maxDays: 3,
    active: true
  }))
  const deliveries = []
  const costs = []
  const payments = []
  const owed = Object.fromEntries(customers.map((c) => [c.id, 0]))

  for (let idx = 0; idx < DAYS; idx++) {
    const date = addDays(today, idx - (DAYS - 1))
    const lowDay = idx % 6 === 4
    const n = lowDay ? 4 : 8 + Math.floor(r() * 4)
    const picked = [...customers].sort(() => r() - 0.5).slice(0, n)
    let kgTotal = 0
    for (const c of picked) {
      const kg = Math.round(6 + r() * 16)
      const bump = r() < 0.18 ? (r() < 0.5 ? -4 : 4) : 0
      const rate = c.rate + bump
      kgTotal += kg
      deliveries.push({
        id: `d${idx}_${c.id}`,
        date,
        customerId: c.id,
        customerName: c.name,
        qty: kg,
        rate,
        cost: DEFAULT_SETTINGS.costPerKg,
        amount: kg * rate,
        note: ''
      })
      owed[c.id] += kg * rate
    }
    const porter = lowDay ? 1650 : r() < 0.3 ? 400 + Math.round(r() * 300) : 0
    costs.push({
      id: date,
      date,
      driver: 700,
      diesel: 280 + Math.round(r() * 160),
      porter,
      other: r() < 0.15 ? 120 : 0,
      porterBooked: porter > 0,
      note: porter ? 'Porter booked for far deliveries' : ''
    })

    // payment habits
    for (const [i, h] of HOTELS.entries()) {
      const c = customers[i]
      const habit = h[4]
      let pay = 0
      if (habit === 'good' && idx % 2 === 1 && idx < DAYS - 1) pay = owed[c.id]
      if (habit === 'weekly' && idx % 7 === 6) pay = owed[c.id]
      if (habit === 'slow' && idx === 14) pay = owed[c.id]
      if (habit === 'slow2' && idx === 17) pay = owed[c.id] * 0.6
      if (habit === 'over' && idx % 5 === 3) pay = owed[c.id] * 0.3
      pay = Math.round(pay)
      if (pay > 0) {
        owed[c.id] -= pay
        payments.push({
          id: `p${idx}_${c.id}`,
          date,
          customerId: c.id,
          customerName: c.name,
          amount: pay,
          mode: idx % 2 ? 'UPI' : 'Cash',
          note: ''
        })
      }
    }
    void kgTotal
  }

  return {
    customers,
    deliveries,
    costs,
    payments,
    settings: { ...DEFAULT_SETTINGS },
    reminders: {}
  }
}
