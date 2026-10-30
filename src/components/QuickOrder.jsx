import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import { areaFromAddress, mapUrl } from '../lib/csv'
import { costFor } from '../lib/calc'
import { hasLL, optimizeOrder } from '../lib/geo'
import { baseOf, driverStart, renumber, stopOf } from '../lib/routing'
import { matchItems, parseOrderPaste } from '../lib/quickOrder'
import { cx, fmtDate, inr, kgf, uid } from '../lib/util'
import { Icon, Modal } from './ui'

const MODES = ['Porter', 'Auto', 'Bike']
const cleanName = (n) => n.replace(/\s+(price\s*)?\d{2}$/i, '').replace(/\s+price$/i, '').trim()

/** Paste an order list -> today's orders. Assign rows to a driver or to hired Porter / Auto / Bike trips with their cost. */
export default function QuickOrder({ open, onClose, preset }) {
  const { data, date, upsert, upsertMany, remove, toast } = useApp()
  const { settings } = data
  const drivers = data.drivers.filter((d) => d.active !== false)
  const [text, setText] = useState('')
  const [rows, setRows] = useState(null)
  const [trips, setTrips] = useState([])
  const [addNew, setAddNew] = useState(true)
  const [drv, setDrv] = useState('')
  const [mode, setMode] = useState('Porter')
  const [cost, setCost] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => {
    setText('')
    setRows(null)
    setTrips([])
    setCost('')
  }
  const close = () => {
    reset()
    onClose()
  }
  const read = () => {
    const items = matchItems(parseOrderPaste(text), data.customers.filter((c) => c.active !== false))
    if (!items.length) return toast('Could not find any orders in that text', 'warn')
    const t = preset === 'porter' ? [{ key: uid(), mode: 'Porter', cost: '' }] : []
    setTrips(t)
    setRows(items.map((it, i) => ({ ...it, k: i, sel: false, asg: preset === 'porter' ? 't:' + t[0].key : '', existing: it.cust ? data.deliveries.find((d) => d.date === date && d.customerId === it.cust.id) : null })))
  }
  const sel = rows?.filter((r) => r.sel) || []
  const patch = (fn) => setRows((rs) => rs.map(fn))
  const toggle = (k) => patch((r) => (r.k === k ? { ...r, sel: !r.sel } : r))
  const setQty = (k, v) => patch((r) => (r.k === k ? { ...r, qty: v } : r))
  const setRate = (k, v) => patch((r) => (r.k === k ? { ...r, rate: v } : r))
  const assignSel = (asg) => {
    patch((r) => (r.sel ? { ...r, asg, sel: false } : r))
  }
  const selectAll = (only) => patch((r) => ({ ...r, sel: only === 'free' ? !r.asg : true }))
  const newTrip = () => {
    if (!sel.length) return toast('Tick the hotels for this vehicle first', 'warn')
    const t = { key: uid(), mode, cost }
    setTrips((x) => [...x, t])
    assignSel('t:' + t.key)
    setCost('')
  }
  const setTripCost = (key, v) => setTrips((x) => x.map((t) => (t.key === key ? { ...t, cost: v } : t)))
  const setTripMode = (key, v) => setTrips((x) => x.map((t) => (t.key === key ? { ...t, mode: v } : t)))

  const tripInfo = (t) => {
    const m = rows.filter((r) => r.asg === 't:' + t.key)
    const kg = m.reduce((s, r) => s + (Number(r.qty) || 0), 0)
    const c = Number(t.cost) || 0
    return { m, kg, c, perKg: kg > 0 ? c / kg : 0 }
  }
  const summary = useMemo(() => {
    if (!rows) return null
    const kg = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0)
    const bill = rows.reduce((s, r) => s + (Number(r.qty) || 0) * (Number(r.rate) || 0), 0)
    const hired = trips.filter((t) => rows.some((r) => r.asg === 't:' + t.key)).reduce((s, t) => s + (Number(t.cost) || 0), 0)
    return { kg, bill, hired, un: rows.filter((r) => !r.asg).length, fresh: rows.filter((r) => !r.cust).length }
  }, [rows, trips])

  const create = () => {
    setBusy(true)
    try {
      const bad = rows.filter((r) => !(Number(r.qty) > 0))
      if (bad.length) throw new Error(`Enter a quantity for ${bad[0].name}`)
      const newCust = []
      const locFix = []
      const idOf = new Map()
      for (const r of rows) {
        let c = r.cust
        if (!c) {
          if (!addNew) throw new Error(`${r.name} is not in Customers. Tick "Add new hotels" or remove it.`)
          c = { id: uid(), name: cleanName(r.name), phone: r.phone, address: r.address, area: areaFromAddress(r.address), rate: Number(r.rate) || Number(settings.defaultRate) || 0, profitPerKg: 0, email: '', creditLimit: 0, maxDays: 0, active: true, lat: r.lat ?? '', lng: r.lng ?? '', locSource: Number.isFinite(r.lat) ? 'import' : '', mapUrl: mapUrl(r.address) }
          newCust.push(c)
        } else if (!hasLL(c) && Number.isFinite(r.lat)) locFix.push({ ...c, lat: r.lat, lng: r.lng, locSource: 'import' })
        idOf.set(r.k, c)
      }
      if (newCust.length || locFix.length) upsertMany('customers', [...newCust, ...locFix])

      const cById = new Map([...data.customers, ...newCust].map((c) => [c.id, c]))
      const replaced = new Set(rows.map((r) => r.existing?.id).filter(Boolean))
      const fresh = rows.map((r) => {
        const c = idOf.get(r.k)
        const rate = Number(r.rate) || Number(c.rate) || Number(settings.defaultRate) || 0
        const qty = Number(r.qty)
        const base = r.existing || {}
        const dId = r.asg.startsWith('d:') ? r.asg.slice(2) : r.asg ? '' : base.driverId || ''
        return { ...base, id: base.id || uid(), date, customerId: c.id, customerName: c.name, qty, rate, cost: costFor(c, settings, Number(c.rate) || rate), amount: qty * rate, note: base.note || '', driverId: dId, seq: dId && dId === base.driverId ? base.seq : '' }
      })
      // routes: append to each chosen driver's day route and re-order to save diesel
      const out = [...fresh]
      const touched = new Set(fresh.filter((d, i) => rows[i].asg.startsWith('d:')).map((d) => d.driverId))
      for (const id of touched) {
        const dr = drivers.find((x) => x.id === id)
        const keep = data.deliveries.filter((d) => d.date === date && d.driverId === id && !replaced.has(d.id) && !fresh.some((f) => f.id === d.id))
        const mine = [...keep, ...fresh.filter((f) => f.driverId === id)].map((d) => stopOf(d, cById.get(d.customerId)))
        const hasBase = baseOf(dr, cById).length > 0
        const ordered = hasBase || mine.length < 2 ? mine : optimizeOrder(driverStart(dr), mine)
        const numbered = renumber(id, ordered)
        numbered.forEach((n) => {
          const at = out.findIndex((o) => o.id === n.id)
          if (at >= 0) out[at] = { ...out[at], seq: n.seq }
          else out.push(n)
        })
      }
      upsertMany('deliveries', out)

      // hired vehicles: take these hotels out of older trips, then save the new trips
      const moved = new Set(rows.filter((r) => r.asg).map((r) => idOf.get(r.k).id))
      data.trips
        .filter((t) => t.date === date)
        .forEach((t) => {
          const ids = t.customerIds.split(',').filter(Boolean)
          const left = ids.filter((x) => !moved.has(x))
          if (left.length === ids.length) return
          left.length ? upsert('trips', { ...t, customerIds: left.join(',') }) : remove('trips', t.id)
        })
      let tripCost = 0
      let tripCount = 0
      for (const t of trips) {
        const ids = rows.filter((r) => r.asg === 't:' + t.key).map((r) => idOf.get(r.k).id)
        if (!ids.length) continue
        upsert('trips', { id: t.key, date, mode: t.mode, cost: Number(t.cost) || 0, customerIds: ids.join(','), note: 'Quick order' })
        tripCost += Number(t.cost) || 0
        tripCount++
      }
      const nd = rows.filter((r) => r.asg.startsWith('d:')).length
      toast(`${out.length} orders saved: ${nd} to drivers${tripCount ? `, ${rows.filter((r) => r.asg.startsWith('t:')).length} on ${tripCount} hired vehicle${tripCount > 1 ? 's' : ''} (${inr(tripCost)})` : ''}${newCust.length ? `, ${newCust.length} new hotels added` : ''}`)
      close()
    } catch (e) {
      toast(e.message, 'warn')
    }
    setBusy(false)
  }

  const label = (a) => {
    if (a.startsWith('d:')) return drivers.find((d) => d.id === a.slice(2))?.name || 'Driver'
    if (a.startsWith('t:')) {
      const i = trips.findIndex((t) => 't:' + t.key === a)
      return i >= 0 ? `${trips[i].mode} ${i + 1}` : 'Trip'
    }
    return ''
  }

  return (
    <Modal open={open} onClose={close} wide>
      <div className="form qo">
        <div className="row between">
          <h3 className="h3">
            <Icon name={preset === 'porter' ? 'truck' : 'plus'} size={18} /> {preset === 'porter' ? 'Quick porter order' : 'Quick order'} · {fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}
          </h3>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>

        {!rows && (
          <>
            <p className="muted">Paste the order list (name, phone, address, location, kg, amount). Each hotel becomes an order for this date. Then choose the driver or the hired vehicle.</p>
            <textarea className="qo-text" rows={10} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Pulusu Hotel\nPulusu · 8072076961\n📍 7, First Floor, 2nd Ave, Anna Nagar\n13.0843,80.2192\n5kg\n₹200\n…\n\nor simply:  Pulusu Hotel - 5kg'} />
            <div className="modal-actions">
              <button className="btn ghost" onClick={close}>Cancel</button>
              <button className="btn primary" disabled={!text.trim()} onClick={read}>
                Read orders
              </button>
            </div>
          </>
        )}

        {rows && (
          <>
            <div className="qo-sum">
              <span><b>{rows.length}</b> orders</span>
              <span><b>{kgf(summary.kg)}</b></span>
              <span>Bill <b>{inr(summary.bill)}</b></span>
              {summary.hired > 0 && <span>Hired cost <b>{inr(summary.hired)}</b></span>}
              {summary.fresh > 0 && (
                <label className="check">
                  <input type="checkbox" checked={addNew} onChange={(e) => setAddNew(e.target.checked)} /> Add {summary.fresh} new hotel{summary.fresh > 1 ? 's' : ''} to Customers
                </label>
              )}
            </div>

            <div className="qo-bar">
              <div className="row gap wrap">
                <button className="btn ghost sm" onClick={() => selectAll('all')}>Select all</button>
                <button className="btn ghost sm" onClick={() => selectAll('free')}>Select not assigned ({summary.un})</button>
                <button className="btn ghost sm" onClick={() => patch((r) => ({ ...r, sel: false }))}>Clear</button>
                <b className="muted">{sel.length} selected</b>
              </div>
              <div className="row gap wrap">
                <select value={drv} onChange={(e) => setDrv(e.target.value)}>
                  <option value="">Own driver…</option>
                  {drivers.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                <button className="btn primary sm" disabled={!sel.length || !drv} onClick={() => assignSel('d:' + drv)}>
                  Assign to driver
                </button>
              </div>
              <div className="row gap wrap">
                <div className="seg">
                  {MODES.map((m) => (
                    <button key={m} type="button" className={cx(mode === m && 'on')} onClick={() => setMode(m)}>
                      {mode === m && <motion.i layoutId="qomode" className="seg-pill" transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
                      <span>{m}</span>
                    </button>
                  ))}
                </div>
                <input className="qo-cost" type="number" inputMode="decimal" min="0" placeholder="Cost ₹" value={cost} onChange={(e) => setCost(e.target.value)} />
                <button className="btn primary sm" disabled={!sel.length} onClick={newTrip}>
                  Book {mode.toLowerCase()} for selected
                </button>
              </div>
              {drivers.length === 0 && <small className="muted">No drivers added yet. Add them from Routes → Drivers.</small>}
            </div>

            {trips.length > 0 && (
              <div className="qo-trips">
                {trips.map((t, i) => {
                  const inf = tripInfo(t)
                  return (
                    <div key={t.key} className="qo-trip">
                      <div className="row between">
                        <b>{t.mode} {i + 1}</b>
                        <select value={t.mode} onChange={(e) => setTripMode(t.key, e.target.value)}>
                          {MODES.map((m) => <option key={m}>{m}</option>)}
                        </select>
                      </div>
                      <small className="muted">{inf.m.length} hotel{inf.m.length === 1 ? '' : 's'} · {kgf(inf.kg)}</small>
                      <div className="row gap">
                        <input type="number" inputMode="decimal" min="0" placeholder="Cost ₹" value={t.cost} onChange={(e) => setTripCost(t.key, e.target.value)} />
                        <span className="muted">{inf.c > 0 && inf.kg > 0 ? `₹${inf.perKg.toFixed(2)}/kg` : 'enter cost'}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="ledger-list qo-list">
              {rows.map((r) => (
                <label key={r.k} className={cx('ledger-row qo-row', r.sel && 'on')}>
                  <input type="checkbox" checked={r.sel} onChange={() => toggle(r.k)} />
                  <span className="ledger-name">
                    <b>{r.cust ? r.cust.name : r.name}</b>
                    <small>
                      {r.cust ? (r.cust.name !== r.name ? `matched from "${r.name}"` : 'existing hotel') : 'new hotel'}
                      {r.existing ? ` · already has ${kgf(r.existing.qty)} today (will update)` : ''}
                    </small>
                  </span>
                  <input className="qo-n" type="number" inputMode="decimal" min="0" step="0.5" value={r.qty} onClick={(e) => e.stopPropagation()} onChange={(e) => setQty(r.k, e.target.value)} aria-label="kg" />
                  <span className="muted">kg ×</span>
                  <input className="qo-n" type="number" inputMode="decimal" min="0" value={r.rate} onClick={(e) => e.stopPropagation()} onChange={(e) => setRate(r.k, e.target.value)} aria-label="rate" />
                  <span className={cx('qo-asg', r.asg ? (r.asg.startsWith('t:') ? 'trip' : 'drv') : '')}>{r.asg ? label(r.asg) : 'not assigned'}</span>
                </label>
              ))}
            </div>
            {summary.un > 0 && <p className="muted">{summary.un} not assigned yet. They will stay under "Unassigned" in Routes.</p>}

            <div className="modal-actions">
              <button className="btn ghost" onClick={reset}>Paste again</button>
              <button className="btn primary" disabled={busy} onClick={create}>
                <Icon name="check" size={18} /> Create {rows.length} orders
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  )
}
