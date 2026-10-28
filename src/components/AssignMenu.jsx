import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import { geocodeCustomer, hasLL, parseLocation } from '../lib/geo'
import { placeStop, renumber, routesForDate, suggest, toRows } from '../lib/routing'
import { cx, inr, kgf } from '../lib/util'
import { unitCostOf } from '../lib/calc'
import { Empty, Icon, Modal, stagger, rise } from './ui'

/** Pick a driver for one order. Shows ranked suggestions with the reason and the extra distance. */
export default function AssignMenu() {
  const { data, assignFor, setAssignFor, upsertMany, upsert, setDriversOpen, toast } = useApp()
  const [pos, setPos] = useState('best')
  const [loc, setLoc] = useState('')
  const [busy, setBusy] = useState(false)
  const del = data.deliveries.find((d) => d.id === assignFor)

  const ctx = useMemo(() => {
    if (!del) return null
    const { drivers, routes } = routesForDate(del.date, data)
    const cur = Object.values(routes).flat().find((s) => s.id === del.id)
    const stop = cur || routesForDate(del.date, data).unassigned.find((s) => s.id === del.id)
    // evaluate as if the order were not on any route yet
    const clean = Object.fromEntries(Object.entries(routes).map(([k, v]) => [k, v.filter((s) => s.id !== del.id)]))
    return { drivers, routes: clean, stop, from: cur?.driverId || '', ranked: stop ? suggest(stop, drivers, clean) : [] }
  }, [data, del])

  if (!del || !ctx?.stop) return <Modal open={false} onClose={() => {}} />
  const { stop, ranked, routes, from } = ctx
  const cust = data.customers.find((c) => c.id === del.customerId)
  const profit = del.qty * (del.rate - unitCostOf(del, data))
  const close = () => {
    setAssignFor(null)
    setPos('best')
    setLoc('')
  }

  const assign = (r) => {
    const route = routes[r.driver.id]
    let rows
    if (pos === 'best') rows = toRows(placeStop(r.driver, route, stop, r.pos))
    else {
      const next = [...route]
      next.splice(pos === 'start' ? 0 : next.length, 0, stop)
      rows = renumber(r.driver.id, next)
    }
    const out = [...rows]
    if (from && from !== r.driver.id) out.push(...renumber(from, routes[from]))
    upsertMany('deliveries', out)
    toast(`${stop.name} → ${r.driver.name}${r.extraKm != null && route.length ? ` (+${r.extraKm.toFixed(1)} km)` : ''}`)
    close()
  }
  const saveLoc = async (find) => {
    setBusy(true)
    try {
      const p = find ? await geocodeCustomer(cust) : parseLocation(loc)
      if (!p) toast(find ? 'Could not find this address on the map. Paste a Google Maps link or lat,lng.' : 'Could not read that location', 'warn')
      else {
        upsert('customers', { ...cust, lat: p.lat, lng: p.lng, locSource: find ? p.source : 'manual' })
        toast('Location saved')
        setLoc('')
      }
    } catch (e) {
      toast(`Location lookup failed: ${e.message}`, 'bad')
    }
    setBusy(false)
  }

  return (
    <Modal open onClose={close} wide>
      <div className="form">
        <div className="row between">
          <h3 className="h3">
            <Icon name="route" size={18} /> Assign driver
          </h3>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="assign-order">
          <div className="avatar">{stop.name?.[0]}</div>
          <div className="li-main">
            <b>{stop.name}</b>
            <small>
              {stop.area || '—'} · {kgf(stop.kg)} · profit <span className={profit >= 0 ? 'pos' : 'neg'}>{inr(profit, true)}</span>
            </small>
            {stop.address && <small className="addr">{stop.address}</small>}
          </div>
        </div>

        {!hasLL(stop) && (
          <div className="preview solid col">
            <span className="warn">
              <Icon name="alert" size={14} /> No map location for this customer, so distance can't be worked out accurately.
            </span>
            <div className="row gap wrap">
              <input value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Paste Google Maps link / lat,lng / plus code" />
              <button type="button" className="btn ghost sm" disabled={!loc || busy} onClick={() => saveLoc(false)}>
                Save
              </button>
              <button type="button" className="btn ghost sm" disabled={busy} onClick={() => saveLoc(true)}>
                {busy ? 'Searching…' : 'Find on map'}
              </button>
            </div>
          </div>
        )}

        {ranked.length === 0 ? (
          <Empty icon="truck" title="No drivers yet" text="Add a driver first.">
            <button className="btn primary" onClick={() => { close(); setDriversOpen(true) }}>
              <Icon name="plus" size={18} /> Add driver
            </button>
          </Empty>
        ) : (
          <>
            <div className="row gap wrap">
              <small className="muted">Stop position</small>
              <div className="seg">
                {[['best', 'Best fit'], ['start', 'First'], ['end', 'Last']].map(([k, l]) => (
                  <button key={k} type="button" className={cx(pos === k && 'on')} onClick={() => setPos(k)}>
                    {pos === k && <motion.i layoutId="posseg" className="seg-pill" />}
                    <span>{l}</span>
                  </button>
                ))}
              </div>
            </div>
            <motion.div className="opts" variants={stagger} initial="hidden" animate="show">
              {ranked.map((r, i) => {
                const pct = r.cap ? Math.min(100, (r.after / r.cap) * 100) : 0
                return (
                  <motion.div key={r.driver.id} variants={rise} className={cx('opt', i === 0 && !r.over && 'best', r.over && 'over', from === r.driver.id && 'cur')}>
                    <div className="opt-main">
                      <div className="row gap">
                        <div className="avatar">{r.driver.name[0]}</div>
                        <div>
                          <b>
                            {r.driver.name}
                            {i === 0 && !r.over && <em className="tag">Best match</em>}
                            {from === r.driver.id && <em className="tag cur">Current</em>}
                          </b>
                          <small className="muted">{r.driver.vehicle || 'Vehicle —'} · {r.load ? `${Math.round(r.load)} kg now` : 'empty'}</small>
                        </div>
                      </div>
                      <ul className="why">
                        {r.reasons.map((x) => (
                          <li key={x} className={x.startsWith('Over') ? 'neg' : x.startsWith('On stretch') || x.startsWith('Same') ? 'pos' : ''}>
                            {x}
                          </li>
                        ))}
                      </ul>
                      {r.cap > 0 && (
                        <div className="track thin">
                          <i className={r.over ? 'neg' : pct > 85 ? 'warn' : 'pos'} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                    </div>
                    <button type="button" className={cx('btn sm', i === 0 && !r.over ? 'primary' : 'ghost')} onClick={() => assign(r)}>
                      {from === r.driver.id ? 'Re-place' : 'Assign'}
                    </button>
                  </motion.div>
                )
              })}
            </motion.div>
          </>
        )}
      </div>
    </Modal>
  )
}
