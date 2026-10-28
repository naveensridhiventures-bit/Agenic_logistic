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
  const selKg = f ? f.ids.reduce((s, id) => s + kgOf(id), 0) : 0
  const cost = f ? Number(f.cost) || 0 : 0

  const save = () => {
    if (!cost) return toast('Enter the charge for this vehicle', 'warn')
    if (!f.ids.length) return toast('Pick the hotels that went in this vehicle', 'warn')
    upsert('trips', { id: f.id || uid(), date, mode: f.mode, cost, customerIds: f.ids.join(','), note: f.note.trim() })
    toast(`${f.mode} saved - ${inr(cost)} for ${kgf(selKg)}`)
    setF(null)
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
            <span className="chip drv">{t.mode}</span>
            <div className="li-main">
              <b>{t.hotels.map((h) => h.name).join(', ') || 'No hotels'}</b>
              <small>
                {kgf(t.kg)} · {inr(t.cost)}
                {t.kg ? ` · ${pk(t.perKg)}/kg` : ''}
                {t.note ? ` · ${t.note}` : ''}
              </small>
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
              <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                {MODES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Charge (₹)">
              <input type="number" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} placeholder="0" />
            </Field>
          </div>
          <Field label="Hotels in this vehicle" hint="Tap to select. Kg is taken from today's orders.">
            <div className="chips">
              {hotels.map((h) => {
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
