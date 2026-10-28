// Tally-style customer ledger: opening balance, bills (debit), payments (credit), running balance.
import { sum } from './util'

export function customerLedger(customer, from, to, data) {
  const ds = data.deliveries.filter((d) => d.customerId === customer.id)
  const ps = data.payments.filter((p) => p.customerId === customer.id)
  const amt = (d) => (Number(d.qty) || 0) * (Number(d.rate) || 0)
  const opening = (from ? sum(ds.filter((d) => d.date < from), amt) - sum(ps.filter((p) => p.date < from), (p) => p.amount) : 0)
  const inRange = (x) => (!from || x.date >= from) && x.date <= to
  const entries = [
    ...ds.filter(inRange).map((d) => ({ date: d.date, kind: 'Sales', text: `Idli batter ${Number(d.qty) || 0} kg @ Rs. ${Number(d.rate) || 0}`, dr: amt(d), cr: 0, id: String(d.id) })),
    ...ps.filter(inRange).map((p) => ({ date: p.date, kind: 'Receipt', text: `Received${p.mode ? ` (${p.mode})` : ''}${p.note ? ` - ${p.note}` : ''}`, dr: 0, cr: Number(p.amount) || 0, id: String(p.id) }))
  ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind === 'Sales' ? -1 : 1))
  let bal = opening
  for (const e of entries) {
    bal += e.dr - e.cr
    e.bal = bal
  }
  const billed = sum(entries, (e) => e.dr)
  const received = sum(entries, (e) => e.cr)
  const kg = sum(entries.filter((e) => e.kind === 'Sales'), (e) => Number(e.text.match(/batter ([\d.]+) kg/)?.[1]) || 0)
  return { customer, from, to, opening, entries, billed, received, kg, closing: opening + billed - received }
}
