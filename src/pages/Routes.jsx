import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion'
import { useApp } from '../store'
import { unitCostOf } from '../lib/calc'
import { dieselFor, fmtDur, hasLL, mapsLinks, optimizeOrder, osrmOrder, routeMetrics } from '../lib/geo'
import { autoAllocate, driverStart, loadOf, placeStop, renumber, routesForDate, suggest, toRows } from '../lib/routing'
import LiveBoard from '../components/LiveBoard'
import { cx, inr, kgf, sum } from '../lib/util'
import { DateNav, Empty, Icon, Num, rise, stagger, Tilt } from '../components/ui'
import RouteMap from '../components/RouteMap'
import FindLocations from '../components/FindLocations'

const COLORS = ['#7c5cff', '#22d3ee', '#ffb547', '#ff5d73', '#2ee59d', '#ff7ad9']

function StopItem({ stop, index, due, profit, onMove, onUnassign, onDragEnd }) {
  const controls = useDragControls()
  return (
    <Reorder.Item value={stop.id} dragListener={false} dragControls={controls} onDragEnd={onDragEnd} className="stop" whileDrag={{ scale: 1.03, boxShadow: '0 18px 40px rgba(0,0,0,.5)', zIndex: 5 }}>
      <button type="button" className="handle" onPointerDown={(e) => controls.start(e)} aria-label="Drag to reorder">
        <Icon name="grip" size={18} />
      </button>
      <span className="seq">{index + 1}</span>
      <div className="li-main">
        <b>{stop.name}</b>
        <small>
          {stop.area || '—'} · {kgf(stop.kg)} · <span className={profit >= 0 ? 'pos' : 'neg'}>{inr(profit, true)}</span>
          {!hasLL(stop) && <span className="warn"> · no map location</span>}
          {stop.locSource === 'approx' && <span className="warn"> · check location</span>}
        </small>
      </div>
      {due > 0.5 && (
        <span className="chip breach" title="Pending payment to collect">
          Collect {inr(due)}
        </span>
      )}
      <button className="icon-btn" onClick={onMove} aria-label="Move to another driver" title="Move to another driver">
        <Icon name="route" size={15} />
      </button>
      <button className="icon-btn danger" onClick={onUnassign} aria-label="Remove from route" title="Remove from route">
        <Icon name="x" size={15} />
      </button>
    </Reorder.Item>
  )
}

function Lane({ driver, color, stops, dueBy, data, onSave, onMove, onUnassign, onOptimize, onPdf, optimizing, pdfBusy }) {
  const start = driverStart(driver)
  const [ids, setIds] = useState(stops.map((s) => s.id))
  const idsRef = useRef(ids)
  const key = stops.map((s) => s.id).join(',')
  useEffect(() => {
    setIds(stops.map((s) => s.id))
    idsRef.current = stops.map((s) => s.id)
  }, [key]) // eslint-disable-line
  const byId = Object.fromEntries(stops.map((s) => [s.id, s]))
  const ordered = ids.map((i) => byId[i]).filter(Boolean)
  const load = loadOf(stops)
  const cap = Number(driver.capacityKg) || 0
  const pct = cap ? Math.min(100, (load / cap) * 100) : 0
  const m = routeMetrics(start, ordered)
  const links = mapsLinks(start, ordered)
  const profit = sum(stops, (s) => s.qty * (s.rate - unitCostOf(s, data)))
  const dz = dieselFor(m.km, data.settings)

  const commit = () => {
    const next = idsRef.current.map((i) => byId[i]).filter(Boolean)
    if (next.map((s) => s.id).join(',') !== key) onSave(renumber(driver.id, next))
  }

  return (
    <Tilt className="lane" strength={2.5} variants={rise} style={{ '--lane': color }}>
      <div className="lane-head">
        <div className="avatar" style={{ background: `${color}33`, color }}>{driver.name[0]}</div>
        <div className="li-main">
          <b>{driver.name}</b>
          <small>{driver.vehicle || 'Vehicle —'}{driver.phone ? ` · ${driver.phone}` : ''}</small>
        </div>
        <span className="chip clear">{stops.length} stop{stops.length === 1 ? '' : 's'}</span>
      </div>
      {driver.stretch && (
        <small className="stretch">
          <Icon name="pin" size={13} /> Stretch: {driver.stretch}
        </small>
      )}

      <div className="loadbar">
        <div className="row between tiny-row">
          <span>Load</span>
          <b>{Math.round(load)}{cap ? ` / ${cap}` : ''} kg</b>
        </div>
        <div className="track">
          <motion.i className={load > cap && cap ? 'neg' : pct > 85 ? 'warn' : 'pos'} animate={{ width: `${pct || (load ? 100 : 0)}%` }} transition={{ duration: 0.7 }} />
        </div>
      </div>

      <div className="metrics">
        <span><b>{m.km.toFixed(1)}</b> km{start ? ' loop' : ''}</span>
        {dz.ok && m.km > 0 && <span title={`${dz.litres.toFixed(1)} litres`}><b>{inr(dz.cost)}</b> diesel</span>}
        <span><b>{stops.length ? fmtDur(m.minutes) : '—'}</b> est.</span>
        <span className={profit >= 0 ? 'pos' : 'neg'}><b>{inr(profit, true)}</b> profit</span>
      </div>
      {start && stops.length > 0 && <small className="muted">Starts at and returns to {data.settings.depotName || 'the pickup point'}.</small>}
      {m.missing > 0 && <small className="warn">{m.missing} stop{m.missing > 1 ? 's' : ''} without map location are not counted in distance.</small>}

      <RouteMap start={start} stops={ordered} color={color} />

      <Reorder.Group axis="y" values={ids} onReorder={(v) => { setIds(v); idsRef.current = v }} className="stops">
        {ordered.map((s, i) => (
          <StopItem key={s.id} stop={s} index={i} due={dueBy.get(s.customerId)?.outstanding || 0} profit={s.qty * (s.rate - unitCostOf(s, data))} onMove={() => onMove(s.id)} onUnassign={() => onUnassign(s)} onDragEnd={commit} />
        ))}
      </Reorder.Group>
      {stops.length === 0 && <p className="muted tiny center">No stops yet. Assign an order from the list above.</p>}

      <div className="row gap wrap lane-actions">
        <button className="btn ghost sm" disabled={stops.length < 2 || optimizing} onClick={() => onOptimize(driver, ordered)}>
          <Icon name="route" size={15} /> {optimizing ? 'Optimizing…' : 'Optimize order'}
        </button>
        <button className="btn ghost sm" disabled={!links.length} onClick={() => window.open(links[0].url, '_blank', 'noopener')}>
          <Icon name="pin" size={15} /> Navigate
        </button>
        <button className="btn primary sm" disabled={!stops.length || !!pdfBusy} onClick={() => onPdf(driver.id, false)}>
          <Icon name="download" size={15} /> {pdfBusy === driver.id ? 'Creating…' : 'Driver PDF'}
        </button>
        <button className="btn ghost sm" disabled={!stops.length || !!pdfBusy} onClick={() => onPdf(driver.id, true)}>
          <Icon name="mail" size={15} /> Share
        </button>
      </div>
    </Tilt>
  )
}

export default function Routes() {
  const { data, dues, date, upsertMany, setAssignFor, setDriversOpen, toast } = useApp()
  const [view, setView] = useState('plan')
  const [locOpen, setLocOpen] = useState(false)
  const [optimizing, setOptimizing] = useState('')
  const [pdfBusy, setPdfBusy] = useState('')

  const { drivers, routes, unassigned } = useMemo(() => routesForDate(date, data), [data, date])
  const dueBy = useMemo(() => new Map(dues.map((d) => [d.customer.id, d])), [dues])
  const all = [...Object.values(routes).flat(), ...unassigned]
  const totalKg = sum(all, (s) => s.kg)
  const km = sum(drivers, (d) => routeMetrics(driverStart(d), routes[d.id]).km)
  const diesel = sum(drivers, (d) => dieselFor(routeMetrics(driverStart(d), routes[d.id]).km, data.settings).cost)
  const assigned = all.length - unassigned.length
  const noLoc = new Set(all.filter((s) => !hasLL(s)).map((s) => s.customerId)).size
  const sugg = useMemo(() => Object.fromEntries(unassigned.map((s) => [s.id, suggest(s, drivers, routes)])), [unassigned, drivers, routes])

  const allocate = () => {
    const rows = autoAllocate(drivers, routes, unassigned)
    upsertMany('deliveries', rows)
    toast(`${unassigned.length} order${unassigned.length > 1 ? 's' : ''} allocated`)
  }
  const unassign = (stop) => {
    const rest = routes[stop.driverId].filter((s) => s.id !== stop.id)
    upsertMany('deliveries', [...toRows([{ ...stop, driverId: '', seq: 0 }]), ...renumber(stop.driverId, rest)])
  }
  const optimize = async (driver, stops) => {
    setOptimizing(driver.id)
    let order
    let how = 'road network'
    try {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 7000)
      order = await osrmOrder(driverStart(driver), stops, ac.signal)
      clearTimeout(t)
    } catch {
      order = optimizeOrder(driverStart(driver), stops)
      how = 'straight-line estimate (road server not reachable)'
    }
    const before = routeMetrics(driverStart(driver), stops).km
    const after = routeMetrics(driverStart(driver), order).km
    upsertMany('deliveries', renumber(driver.id, order))
    const saved = before - after
    const dz = dieselFor(saved, data.settings)
    toast(saved > 0.3 ? `${driver.name}: route optimized, saves ${saved.toFixed(1)} km${dz.ok ? ` (about ${inr(dz.cost)} diesel)` : ''} - ${how}` : `${driver.name}: route already efficient - ${how}`)
    setOptimizing('')
  }
  const optimizeAll = async () => {
    for (const d of drivers) if (routes[d.id].length > 1) await optimize(d, routes[d.id])
  }
  const makePdf = async (driverId, share) => {
    setPdfBusy(driverId)
    try {
      const [{ buildRoutePdf }, { sharePdf }] = await Promise.all([import('../lib/routePdf'), import('../lib/report')])
      const { doc, filename } = await buildRoutePdf({ date, data, driverId })
      if (share) {
        const r = await sharePdf(doc, filename, 'Agenic delivery route sheet')
        if (r === 'downloaded') toast('Sharing not supported here - PDF downloaded instead')
      } else {
        doc.save(filename)
        toast('Route sheet downloaded')
      }
    } catch (e) {
      toast(`Could not create PDF: ${e.message}`, 'bad')
    }
    setPdfBusy('')
  }

  const toggle = (
    <div className="seg">
      {[['plan', 'Plan'], ['live', 'Live status']].map(([k, label]) => (
        <button key={k} type="button" className={cx(view === k && 'on')} onClick={() => setView(k)}>
          {view === k && <motion.i layoutId="routeseg" className="seg-pill" transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
          <span>{label}</span>
        </button>
      ))}
    </div>
  )
  if (view === 'live')
    return (
      <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
        <motion.div variants={rise} className="row between wrap">
          <div>
            <h2 className="h1">Live status</h2>
            <p className="muted">What each driver has done so far. Updates every few seconds.</p>
          </div>
          <DateNav future={3} />
        </motion.div>
        <motion.div variants={rise}>{toggle}</motion.div>
        <LiveBoard />
      </motion.div>
    )

  return (
    <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise}>{toggle}</motion.div>
      <motion.div variants={rise} className="row between wrap">
        <div>
          <h2 className="h1">Routes &amp; drivers</h2>
          <p className="muted">Assign each order to a driver and send him a route sheet.</p>
        </div>
        <DateNav future={3} />
      </motion.div>

      <motion.div variants={rise} className="row gap wrap">
        <button className="btn primary" disabled={!unassigned.length || !drivers.length} onClick={allocate}>
          <Icon name="route" size={18} /> Auto-allocate {unassigned.length || ''}
        </button>
        <button className="btn ghost" disabled={!drivers.length || !!optimizing} onClick={optimizeAll}>
          Optimize all routes
        </button>
        <button className="btn ghost" onClick={() => setDriversOpen(true)}>
          <Icon name="truck" size={16} /> Drivers
        </button>
        <button className="btn ghost" onClick={() => setLocOpen(true)}>
          <Icon name="pin" size={16} /> Find locations
        </button>
        <button className="btn ghost" disabled={!assigned || !!pdfBusy} onClick={() => makePdf('all', false)}>
          <Icon name="download" size={16} /> All drivers PDF
        </button>
      </motion.div>

      <div className="tiles">
        <Tilt variants={rise} className="tile accent">
          <span className="tile-ic"><Icon name="box" size={18} /></span>
          <small>Orders · {kgf(totalKg)}</small>
          <b><Num value={all.length} format={(v) => String(Math.round(v))} /></b>
        </Tilt>
        <Tilt variants={rise} className={cx('tile', unassigned.length ? 'warn' : 'pos')}>
          <span className="tile-ic"><Icon name="alert" size={18} /></span>
          <small>Waiting for a driver</small>
          <b><Num value={unassigned.length} format={(v) => String(Math.round(v))} /></b>
        </Tilt>
        <Tilt variants={rise} className="tile pos">
          <span className="tile-ic"><Icon name="check" size={18} /></span>
          <small>Assigned</small>
          <b><Num value={assigned} format={(v) => String(Math.round(v))} /></b>
        </Tilt>
        <Tilt variants={rise} className="tile">
          <span className="tile-ic"><Icon name="route" size={18} /></span>
          <small>Est. distance · diesel {inr(diesel)}</small>
          <b><Num value={km} format={(v) => `${v.toFixed(1)} km`} /></b>
        </Tilt>
      </div>

      {noLoc > 0 && (
        <motion.div variants={rise} className="preview">
          <span>
            <Icon name="alert" size={14} /> {noLoc} customer{noLoc > 1 ? 's' : ''} here have no map location, so suggestions are less accurate.
          </span>
          <button className="link" onClick={() => setLocOpen(true)}>Find locations</button>
        </motion.div>
      )}

      {drivers.length === 0 && (
        <Empty icon="truck" title="Add your drivers first" text="Enter each driver's vehicle capacity, start point and the stretch he covers. Then new orders get a suggested driver.">
          <button className="btn primary" onClick={() => setDriversOpen(true)}>
            <Icon name="plus" size={18} /> Add driver
          </button>
        </Empty>
      )}

      {all.length === 0 && drivers.length > 0 && <Empty icon="box" title="No orders for this date" text="Add orders in Daily Entry (you can add for tomorrow too)." />}

      {unassigned.length > 0 && drivers.length > 0 && (
        <section>
          <h3 className="h3">Waiting for a driver ({unassigned.length})</h3>
          <motion.div className="ucards" variants={stagger}>
            <AnimatePresence>
              {unassigned.map((s) => {
                const best = sugg[s.id]?.[0]
                const profit = s.qty * (s.rate - unitCostOf(s, data))
                return (
                  <motion.div key={s.id} layout variants={rise} exit={{ opacity: 0, scale: 0.9 }} className="card ucard">
                    <div className="row between">
                      <b>{s.name}</b>
                      <span className="chip warn">{kgf(s.kg)}</span>
                    </div>
                    <small className="muted">{s.area || '—'} · profit <span className={profit >= 0 ? 'pos' : 'neg'}>{inr(profit, true)}</span>{!hasLL(s) && <span className="warn"> · no map location</span>}</small>
                    {best && (
                      <div className="suggest">
                        <small>Suggested</small>
                        <b>{best.driver.name}</b>
                        <small className="muted">{best.reasons[0]}</small>
                      </div>
                    )}
                    <div className="row gap">
                      <button className="btn primary sm grow" disabled={!best || best.over} onClick={() => {
                        upsertMany('deliveries', toRows(placeOne(best, routes, s)))
                        toast(`${s.name} → ${best.driver.name}`)
                      }}>
                        <Icon name="check" size={15} /> Assign to {best?.driver.name.split(' ')[0]}
                      </button>
                      <button className="btn ghost sm" onClick={() => setAssignFor(s.id)}>Choose…</button>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </motion.div>
        </section>
      )}

      {drivers.length > 0 && (
        <section>
          <h3 className="h3">Driver routes</h3>
          <motion.div className="lanes" variants={stagger}>
            {drivers.map((d, i) => (
              <Lane key={d.id} driver={d} color={COLORS[i % COLORS.length]} stops={routes[d.id]} dueBy={dueBy} data={data} onSave={(rows) => upsertMany('deliveries', rows)} onMove={setAssignFor} onUnassign={unassign} onOptimize={optimize} onPdf={makePdf} optimizing={optimizing === d.id} pdfBusy={pdfBusy} />
            ))}
          </motion.div>
        </section>
      )}

      <FindLocations open={locOpen} onClose={() => setLocOpen(false)} date={date} />
    </motion.div>
  )
}

function placeOne(best, routes, stop) {
  return placeStop(best.driver, routes[best.driver.id], stop, best.pos)
}
