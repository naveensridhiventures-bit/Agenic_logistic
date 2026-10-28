// Date-wise delivery log: who delivered what, payment collected, remarks. Built from deliveries + driver tracking.
import { addDays, sum } from './util'

export function dayLog(date, data) {
  const trk = new Map((data.tracking || []).map((t) => [t.id, t]))
  const drivers = new Map(data.drivers.map((d) => [d.id, d]))
  const trips = (data.trips || []).filter((t) => t.date === date)
  const tripOf = (cid) => trips.find((t) => String(t.customerIds).split(',').includes(cid))
  const rows = data.deliveries
    .filter((d) => d.date === date)
    .map((d) => {
      const t = trk.get(d.id) || {}
      const trip = tripOf(d.customerId)
      const bill = (Number(d.qty) || 0) * (Number(d.rate) || 0)
      const status = t.status === 'delivered' || t.status === 'skipped' ? t.status : 'pending'
      const collected = status === 'delivered' && (t.payMode === 'cash' || t.payMode === 'gpay') ? Number(t.payAmount) || 0 : 0
      return {
        id: d.id,
        customerId: d.customerId,
        name: d.customerName,
        kg: Number(d.qty) || 0,
        bill,
        status,
        by: trip ? trip.mode : drivers.get(d.driverId)?.name || (d.driverId ? 'Driver' : 'Unassigned'),
        driverId: d.driverId || '',
        seq: Number(d.seq) || 999,
        doneAt: t.doneAt || '',
        payMode: status === 'delivered' ? t.payMode || '' : '',
        payAmount: collected,
        remark: t.remark || '',
        voiceId: t.voiceId || '',
        unlocked: String(t.unlocked) === 'yes',
        tracked: !!t.status
      }
    })
    .sort((a, b) => String(a.by).localeCompare(String(b.by)) || a.seq - b.seq)
  const delivered = rows.filter((r) => r.status === 'delivered')
  const collected = sum(rows, (r) => r.payAmount)
  const deliveredBill = sum(delivered, (r) => r.bill)
  return {
    date,
    rows,
    orders: rows.length,
    done: delivered.length,
    skipped: rows.filter((r) => r.status === 'skipped').length,
    kg: sum(rows, (r) => r.kg),
    bill: sum(rows, (r) => r.bill),
    cash: sum(rows.filter((r) => r.payMode === 'cash'), (r) => r.payAmount),
    gpay: sum(rows.filter((r) => r.payMode === 'gpay'), (r) => r.payAmount),
    collected,
    pending: Math.max(0, deliveredBill - collected), // delivered but not paid
    notes: rows.filter((r) => r.remark || r.voiceId).length
  }
}

/** Newest first, only days that have orders. */
export function logRange(from, to, data) {
  const out = []
  for (let d = to; d >= from; d = addDays(d, -1)) {
    const l = dayLog(d, data)
    if (l.orders) out.push(l)
    if (out.length > 400) break
  }
  return out
}
