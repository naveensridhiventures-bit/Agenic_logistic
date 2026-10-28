import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store'
import { nominatim, parseLocation } from '../lib/geo'
import { parseRoute, routesForDate } from '../lib/routing'
import { todayStr, uid } from '../lib/util'
import { Empty, Field, Icon, Modal } from './ui'

const blank = { id: null, name: '', phone: '', vehicle: '', capacityKg: '', startAddress: '', stretch: '', baseRoute: '', active: true }

export default function DriverModal() {
  const { data, driversOpen, setDriversOpen, upsert, upsertMany, remove, toast } = useApp()
  const [edit, setEdit] = useState(null)
  const [saving, setSaving] = useState(false)
  const drivers = data.drivers
  const [paste, setPaste] = useState('')
  const baseIds = edit ? String(edit.baseRoute || '').split(',').filter(Boolean) : []
  const cName = (id) => data.customers.find((c) => c.id === id)?.name || id
  const readPaste = () => {
    const r = parseRoute(paste, data.customers)
    if (!r.ids.length) return toast('No hotels matched. Paste the list with names and lat,lng lines.', 'warn')
    setEdit({ ...edit, baseRoute: r.ids.join(',') })
    setPaste('')
    toast(`${r.ids.length} of ${r.total} hotels matched${r.unmatched.length ? ` - not found: ${r.unmatched.slice(0, 4).join(', ')}${r.unmatched.length > 4 ? '...' : ''}` : ''}`, r.unmatched.length ? 'warn' : 'ok')
  }
  const fromToday = () => {
    const { routes } = routesForDate(todayStr(), data)
    const ids = (routes[edit.id] || []).map((s) => s.customerId)
    if (!ids.length) return toast('No orders are assigned to this driver today yet', 'warn')
    setEdit({ ...edit, baseRoute: ids.join(',') })
  }

  const close = () => {
    setEdit(null)
    setDriversOpen(false)
  }
  const save = async (e) => {
    e.preventDefault()
    if (!edit.name.trim()) return toast('Driver name is required', 'warn')
    setSaving(true)
    let startLat = null
    let startLng = null
    const txt = edit.startAddress.trim()
    if (txt) {
      const p = parseLocation(txt)
      if (p) {
        startLat = p.lat
        startLng = p.lng
      } else if (edit.startLat != null && txt === edit.origStart) {
        startLat = edit.startLat
        startLng = edit.startLng
      } else {
        try {
          const g = await nominatim(`${txt}, Tamil Nadu`)
          if (g) {
            startLat = g.lat
            startLng = g.lng
          } else toast('Saved, but the start point was not found on the map. Paste a Google Maps link or lat,lng.', 'warn')
        } catch {
          toast('Saved, but the start point could not be looked up (offline?). Paste lat,lng or a Maps link instead.', 'warn')
        }
      }
    }
    upsert('drivers', {
      id: edit.id || uid(),
      name: edit.name.trim(),
      phone: edit.phone.trim(),
      vehicle: edit.vehicle.trim(),
      capacityKg: Number(edit.capacityKg) || 0,
      startAddress: txt,
      startLat,
      startLng,
      stretch: edit.stretch.trim(),
      baseRoute: edit.baseRoute || '',
      active: edit.active
    })
    setSaving(false)
    toast(edit.id ? 'Driver updated' : 'Driver added')
    setEdit(null)
  }
  const del = (d) => {
    if (!confirm(`Delete ${d.name}? Today's and upcoming orders assigned to them become unassigned.`)) return
    const rows = data.deliveries.filter((x) => x.driverId === d.id && x.date >= todayStr()).map((x) => ({ ...x, driverId: '', seq: 0 }))
    if (rows.length) upsertMany('deliveries', rows)
    remove('drivers', d.id)
    toast('Driver deleted')
  }

  return (
    <Modal open={driversOpen} onClose={close} wide>
      <div className="form">
        <div className="row between">
          <h3 className="h3">
            <Icon name="truck" size={18} /> {edit ? (edit.id ? 'Edit driver' : 'New driver') : 'Drivers'}
          </h3>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>

        {!edit && (
          <>
            <AnimatePresence initial={false}>
              {drivers.map((d) => (
                <motion.div key={d.id} layout className="li" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, height: 0 }}>
                  <div className="avatar">{d.name[0]}</div>
                  <div className="li-main">
                    <b>{d.name}</b>
                    <small>
                      {d.vehicle || 'Vehicle —'} · {d.capacityKg ? `${d.capacityKg} kg` : 'no capacity set'} · {d.stretch ? `Stretch: ${d.stretch}` : 'no stretch set'}
                    </small>
                  </div>
                  <button className="icon-btn" onClick={() => setEdit({ ...blank, ...d, capacityKg: d.capacityKg || '', origStart: d.startAddress || '' })} aria-label="Edit">
                    <Icon name="edit" size={16} />
                  </button>
                  <button className="icon-btn danger" onClick={() => del(d)} aria-label="Delete">
                    <Icon name="trash" size={16} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {drivers.length === 0 && <Empty icon="truck" title="No drivers yet" text="Add your drivers, their vehicle capacity and the stretch they cover." />}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={close}>
                Close
              </button>
              <button type="button" className="btn primary" onClick={() => setEdit({ ...blank })}>
                <Icon name="plus" size={18} /> Add driver
              </button>
            </div>
          </>
        )}

        {edit && (
          <form className="form" onSubmit={save}>
            <div className="two">
              <Field label="Driver name">
                <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              </Field>
            </div>
            <div className="two">
              <Field label="Vehicle">
                <input value={edit.vehicle} onChange={(e) => setEdit({ ...edit, vehicle: e.target.value })} placeholder="e.g. Ace TN 09 AB 1234" />
              </Field>
              <Field label="Capacity (kg)" hint="max batter he can carry">
                <input type="number" inputMode="decimal" value={edit.capacityKg} onChange={(e) => setEdit({ ...edit, capacityKg: e.target.value })} />
              </Field>
            </div>
            <Field label="Current route stretch" hint="Areas / road he is covering now, comma separated. New orders in these areas are suggested to him first.">
              <input value={edit.stretch} onChange={(e) => setEdit({ ...edit, stretch: e.target.value })} placeholder="OMR, Sholinganallur, Perungudi, Thoraipakkam" />
            </Field>
            <Field label="Regular route (in order)" hint="The route he drives now, with kg ignored. Paste the list (name + lat,lng lines), or copy today's route. New orders are suggested by how little they take him off this route.">
              <textarea rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste route list here…" />
            </Field>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn ghost" onClick={readPaste} disabled={!paste.trim()}>
                Read pasted route
              </button>
              {edit.id && (
                <button type="button" className="btn ghost" onClick={fromToday}>
                  Use today's route
                </button>
              )}
              {baseIds.length > 0 && (
                <button type="button" className="btn ghost" onClick={() => setEdit({ ...edit, baseRoute: '' })}>
                  Clear
                </button>
              )}
            </div>
            {baseIds.length > 0 && (
              <small className="muted">
                {baseIds.length} stops: {baseIds.slice(0, 6).map(cName).join(' › ')}
                {baseIds.length > 6 ? ' › …' : ''}
              </small>
            )}
            <Field label="Start point" hint="Address, Google Maps link, lat,lng or plus code. Where he loads / begins the day.">
              <input value={edit.startAddress} onChange={(e) => setEdit({ ...edit, startAddress: e.target.value })} placeholder="Agenic kitchen, Perungudi" />
            </Field>
            <label className="switch">
              <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
              <i />
              <span>Active (available for routes)</span>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>
                Back
              </button>
              <button type="submit" className="btn primary" disabled={saving}>
                <Icon name="check" size={18} /> {saving ? 'Saving…' : 'Save driver'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
  )
}
