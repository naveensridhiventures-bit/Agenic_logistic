import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store'
import { cx, inr, kgf, uid } from '../lib/util'
import { Field, Icon } from './ui'

const pk = (n) => `₹${(Number(n) || 0).toFixed(2)}`
const MODES = ['Porter', 'Auto', 'Bike', 'Other']
const blank = { id: null, mode: 'Porter', cost: '', ids: [], note: '' }

/** Hired vehicles for the day: which hotels went in which porter / auto / bike and what it cost. */
export default function Trips({ date, stats }) {
  const { data, upsert, remove, toast } = useApp()
  const [f, setF] = useState(null)
  const [q, setQ] = useState('')
  const [quick, setQuick] = useState({ id: null, v: '' })
  const hotels = []
  const seen = new Set()
  data.deliveries
    .filter((d) => d.date === date)
    .forEach((d) => {
      if (seen.has(d.customerId)) return
      seen.add(d.customerId)
      hotels.push({ id: d.customerId, name: data.customers.find((c) => c.id === d.customerId)?.name || d.customerName })
    })
  const kgOf = (id) => data.deliveries.filter((d) => d.date === date && d.customerId === id).reduce((s, d) => s + (Number(d.qty) || 0), 0)
  const takenBy = (id) => stats.trips.find((t) => t.id !== f?.id && t.customerIds.split(',').includes(id))
  const shown = [...hotels]
    .filter((h) => !q.trim() || String(h.name).toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (takenBy(a.id) ? 1 : 0) - (takenBy(b.id) ? 1 : 0))
  const selKg = f ? f.ids.reduce((s, id) => s + kgOf(id), 0) : 0
  const cost = f ? Number(f.cost) || 0 : 0

  const save = () => {
    if (!f.ids.length) return toast('Pick the hotels that went in this vehicle', 'warn')
    upsert('trips', { id: f.id || uid(), date, mode: f.mode, cost, customerIds: f.ids.join(','), note: f.note.trim() })
    toast(cost ? `${f.mode} saved - ${inr(cost)} for ${kgf(selKg)}` : `${f.mode} saved for ${f.ids.length} hotel${f.ids.length === 1 ? '' : 's'}. Add the charge later.`, cost ? 'ok' : 'warn')
    setF(null)
    setQ('')
  }
  const saveCharge = (t) => {
    const v = Number(quick.v) || 0
    if (!v) return toast('Enter the amount', 'warn')
    upsert('trips', { ...t, cost: v, customerIds: t.customerIds, hotels: undefined, kg: undefined, perKg: undefined })
    setQuick({ id: null, v: '' })
    toast(`${t.mode} charge saved - ${inr(v)}`)
  }
  const del = (t) => {
    if (!confirm(`Remove this ${t.mode} trip (${inr(t.cost)})?`)) return
    remove('trips', t.id)
    toast(`${t.mode} trip removed`)
  }

  return (
    <div className="trips">
      <div className="row between">
        <b>Hired vehicles (porter / auto / bike)</b>
        {!f && (
          <button type="button" className="btn ghost sm" onClick={() => setF({ ...blank })} disabled={!hotels.length}>
            <Icon name="plus" size={16} /> Add vehicle
          </button>
        )}
      </div>
      {!hotels.length && <small className="muted">Add the day's deliveries first, then record which hotels went by porter, auto or bike.</small>}

      <AnimatePresence initial={false}>
        {stats.trips.map((t) => (
          <motion.div key={t.id} layout className="li trip" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
            <span className={cx('chip drv', t.cost > 0 ? '' : 'warn')}>{t.cost > 0 ? t.mode : `${t.mode} · pending`}</span>
            <div className="li-main">
              <b>{t.hotels.map((h) => h.name).join(', ') || 'No hotels'}</b>
              <small>
                {kgf(t.kg)} · {t.cost > 0 ? inr(t.cost) : 'charge not entered yet'}
                {t.kg && t.cost > 0 ? ` · ${pk(t.perKg)}/kg` : ''}
                {t.note ? ` · ${t.note}` : ''}
              </small>
              {t.cost > 0 ? null : quick.id === t.id ? (
                <div className="row gap trip-quick">
                  <input type="number" inputMode="decimal" autoFocus value={quick.v} onChange={(e) => setQuick({ id: t.id, v: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && saveCharge(t)} placeholder="Amount ₹" />
                  <button type="button" className="btn primary sm" onClick={() => saveCharge(t)}>
                    Save
                  </button>
                  <button type="button" className="btn ghost sm" onClick={() => setQuick({ id: null, v: '' })}>
                    Cancel
                  </button>
                </div>
              ) : (
                <button type="button" className="btn ghost sm trip-add" onClick={() => setQuick({ id: t.id, v: '' })}>
                  <Icon name="plus" size={14} /> Enter charge
                </button>
              )}
            </div>
            <button type="button" className="icon-btn" aria-label="Edit trip" onClick={() => setF({ id: t.id, mode: t.mode, cost: t.cost, ids: t.customerIds.split(',').filter(Boolean), note: t.note || '' })}>
              <Icon name="edit" size={16} />
            </button>
            <button type="button" className="icon-btn danger" aria-label="Delete trip" onClick={() => del(t)}>
              <Icon name="trash" size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>

      {stats.legacyPorter > 0 && (
        <div className="li trip">
          <span className="chip drv">Porter</span>
          <div className="li-main">
            <b>Lump sum (not split by hotel)</b>
            <small>{inr(stats.legacyPorter)} entered earlier</small>
          </div>
          <button type="button" className="icon-btn danger" aria-label="Remove lump sum" onClick={() => upsert('costs', { ...data.costs.find((c) => c.date === date), porter: 0, porterBooked: false })}>
            <Icon name="trash" size={16} />
          </button>
        </div>
      )}

      {stats.trips.length > 0 && (
        <div className="preview solid">
          <span>
            Hired total <b>{inr(stats.hired)}</b> for {kgf(stats.hiredKg)}
          </span>
          <span>{stats.hiredKg ? `${pk(stats.hired / stats.hiredKg)} per kg` : ''}</span>
        </div>
      )}

      {f && (
        <div className="form trip-form">
          <div className="two">
            <Field label="Vehicle">
              <div className="chips">
                {MODES.map((m) => (
                  <button type="button" key={m} className={cx('pick', f.mode === m && 'on')} onClick={() => setF({ ...f, mode: m })}>
                    {m}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Charge (₹)" hint="Leave empty if not fixed yet. Add it later.">
              <input type="number" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} placeholder="0" />
            </Field>
          </div>
          <Field label="Hotels in this vehicle" hint="Search and tap to select as many as you need. Kg is taken from today's orders.">
            <input className="trip-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hotel…" />
            <div className="row gap wrap">
              <button type="button" className="link" onClick={() => setF({ ...f, ids: [...new Set([...f.ids, ...shown.filter((h) => !takenBy(h.id)).map((h) => h.id)])] })}>
                Select all shown
              </button>
              {f.ids.length > 0 && (
                <button type="button" className="link" onClick={() => setF({ ...f, ids: [] })}>
                  Clear ({f.ids.length})
                </button>
              )}
            </div>
            <div className="chips">
              {shown.map((h) => {
                const on = f.ids.includes(h.id)
                const other = takenBy(h.id)
                return (
                  <button
                    type="button"
                    key={h.id}
                    className={cx('pick', on && 'on')}
                    onClick={() => setF({ ...f, ids: on ? f.ids.filter((x) => x !== h.id) : [...f.ids, h.id] })}
                    title={other ? `Already in a ${other.mode} trip` : ''}
                  >
                    {on && <Icon name="check" size={13} />} {h.name} · {kgf(kgOf(h.id))}
                    {other && !on ? ` (${other.mode})` : ''}
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="Note">
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="optional, e.g. booking ID" />
          </Field>
          <div className="preview solid">
            <span>
              {f.ids.length} hotel{f.ids.length === 1 ? '' : 's'} · <b>{kgf(selKg)}</b>
            </span>
            <span>{selKg && cost ? `${pk(cost / selKg)} per kg` : ''}</span>
          </div>
          <div className="row gap">
            <button type="button" className="btn primary grow" onClick={save}>
              <Icon name="check" size={18} /> Save vehicle
            </button>
            <button type="button" className="btn ghost" onClick={() => setF(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
