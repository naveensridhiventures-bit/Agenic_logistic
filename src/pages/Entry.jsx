import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store'
import { costFor, dayStats, deliveryPayStatus, PAY_CHIP, PAY_LABEL, unitCostOf } from '../lib/calc'
import { cx, inr, kgf, todayStr, uid } from '../lib/util'
import Trips from '../components/Trips'
import { DateNav, Empty, Field, Icon, Num, rise, stagger } from '../components/ui'

const blank = { id: null, customerId: '', qty: '', rate: '', profit: '', paid: false, mode: 'Cash', by: 'driver', charge: '' }
const r2 = (n) => Math.round(n * 100) / 100

export default function Entry() {
  const { data, date, upsert, remove, toast, setTab, setAssignFor } = useApp()
  const { settings } = data
  const s = useMemo(() => dayStats(date, data), [data, date])
  const customers = data.customers.filter((c) => c.active !== false)
  const todays = data.deliveries.filter((d) => d.date === date)
  const saved = data.costs.find((c) => c.date === date)
  const pay = useMemo(() => deliveryPayStatus(data), [data])
  const [busy, setBusy] = useState('')

  // ---------- delivery form ----------
  const [f, setF] = useState(blank)
  const cust = data.customers.find((c) => c.id === f.customerId)
  const qty = Number(f.qty) || 0
  const rate = Number(f.rate) || 0
  const amount = qty * rate
  const profit = Number(f.profit) || 0
  const unitCost = Math.max(0, rate - profit) // cost stays fixed if you change the rate, so profit moves with it
  const lineMargin = qty * profit

  const pickCustomer = (id) => {
    const c = data.customers.find((x) => x.id === id)
    const r = c ? c.rate || settings.defaultRate : ''
    setF((p) => ({ ...p, customerId: id, rate: r, profit: c ? r2(Math.max(0, r - costFor(c, settings, r))) || '' : '' }))
  }
  const onRate = (v) =>
    setF((p) => {
      const delta = (Number(v) || 0) - (Number(p.rate) || 0)
      return { ...p, rate: v, profit: p.profit === '' ? '' : r2((Number(p.profit) || 0) + delta) }
    })
  const todaysTrips = data.trips.filter((t) => t.date === date)
  const tripOf = (customerId) => todaysTrips.find((t) => t.customerIds.split(',').includes(customerId))
  const detach = (customerId) => {
    const t = tripOf(customerId)
    if (!t) return
    const ids = t.customerIds.split(',').filter((x) => x && x !== customerId)
    if (ids.length) upsert('trips', { ...t, customerIds: ids.join(',') })
    else remove('trips', t.id)
  }
  const applyBy = (customerId) => {
    const cur = tripOf(customerId)
    const want = f.by
    if (cur && want === 'trip:' + cur.id) return
    if (cur) detach(customerId)
    if (want.startsWith('new:')) upsert('trips', { id: uid(), date, mode: want.slice(4), cost: Number(f.charge) || 0, customerIds: customerId, note: '' })
    else if (want.startsWith('trip:')) {
      const t = todaysTrips.find((x) => x.id === want.slice(5))
      if (t) upsert('trips', { ...t, customerIds: [...t.customerIds.split(',').filter(Boolean), customerId].join(',') })
    }
  }
  const delDelivery = (d) => {
    remove('deliveries', d.id)
    if (todays.filter((x) => x.customerId === d.customerId && x.id !== d.id).length === 0) detach(d.customerId)
  }
  const addDelivery = (e) => {
    e.preventDefault()
    if (!cust || qty <= 0 || rate <= 0) return toast('Choose a customer, quantity and rate', 'warn')
    const row = {
      id: f.id || uid(),
      date,
      customerId: cust.id,
      customerName: cust.name,
      qty,
      rate,
      cost: unitCost,
      amount,
      note: ''
    }
    upsert('deliveries', row)
    applyBy(cust.id)
    if (f.by.startsWith('new:') && !(Number(f.charge) > 0)) toast(`${f.by.slice(4)} added with no charge yet - enter it under Hired vehicles`, 'warn')
    if (f.paid && !f.id)
      upsert('payments', {
        id: uid(),
        date,
        customerId: cust.id,
        customerName: cust.name,
        amount,
        mode: f.mode,
        note: 'Paid on delivery'
      })
    toast(f.id ? 'Delivery updated' : `Added ${kgf(qty)} for ${cust.name}${f.paid ? ' (paid)' : ''}`)
    setF(blank)
    if (!f.id && f.by === 'driver' && data.drivers.some((x) => x.active !== false) && date >= todayStr()) setAssignFor(row.id)
  }
  const edit = (d) =>
    setF({ id: d.id, customerId: d.customerId, qty: d.qty, rate: d.rate, profit: r2(d.rate - unitCostOf(d, data)), paid: false, mode: 'Cash', by: tripOf(d.customerId) ? 'trip:' + tripOf(d.customerId).id : 'driver', charge: '' })

  // ---------- day cost form ----------
  const initCost = () => ({
    driver: saved ? saved.driver : settings.driverPerDay,
    diesel: saved ? saved.diesel : '',
    porter: saved ? saved.porter : '',
    other: saved ? saved.other : '',
    porterBooked: saved ? !!saved.porter || saved.porterBooked === true : false,
    note: saved?.note || ''
  })
  const [c, setC] = useState(initCost)
  useEffect(() => setC(initCost()), [date, saved?.id]) // eslint-disable-line
  const n = (v) => Number(v) || 0
  const logistics = n(c.driver) + n(c.diesel) + n(saved?.porter) + s.hired + n(c.other)
  const liveNet = s.margin - logistics
  const dirty =
    !saved ||
    n(saved.driver) !== n(c.driver) ||
    n(saved.diesel) !== n(c.diesel) ||
    n(saved.other) !== n(c.other) ||
    (saved.note || '') !== c.note

  const saveCosts = () => {
    upsert('costs', {
      id: date,
      date,
      driver: n(c.driver),
      diesel: n(c.diesel),
      porter: n(saved?.porter),
      other: n(c.other),
      porterBooked: n(saved?.porter) > 0,
      note: c.note
    })
    toast(liveNet >= 0 ? `Saved - ${inr(liveNet)} profit for the day` : `Saved - ${inr(liveNet)} loss for the day`, liveNet >= 0 ? 'ok' : 'warn')
  }

  const deleteCosts = () => {
    if (!confirm('Delete the driver / diesel / porter costs for this day?')) return
    remove('costs', date)
    toast('Day cost deleted')
  }
  const makePdf = async (share) => {
    setBusy(share ? 'share' : 'pdf')
    try {
      const { buildReport, sharePdf } = await import('../lib/report')
      const { doc, filename, summary } = await buildReport({ mode: 'day', anchor: date, data })
      if (share) {
        const r = await sharePdf(doc, filename, `Agenic daily report ${date}: ${inr(summary.net, true)} net, ${inr(summary.pending)} pending`)
        if (r === 'downloaded') toast('Sharing not supported here - PDF downloaded instead')
      } else {
        doc.save(filename)
        toast('Day report downloaded')
      }
    } catch (err) {
      toast(`Could not create PDF: ${err.message}`, 'bad')
    }
    setBusy('')
  }

  return (
    <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise} className="row between wrap">
        <div>
          <h2 className="h1">Daily entry</h2>
          <p className="muted">Record deliveries and what it cost to deliver them.</p>
        </div>
        <DateNav future={3} />
      </motion.div>

      {customers.length === 0 && (
        <motion.div variants={rise} className="preview solid">
          <span>No customers yet. Import your hotels first.</span>
          <button type="button" className="link" onClick={() => setTab('cust')}>
            Go to Customers
          </button>
        </motion.div>
      )}

      {Number(settings.defaultProfitPerKg) === 0 && Number(settings.costPerKg) === 0 && !data.customers.some((c) => Number(c.profitPerKg) > 0) && (
        <motion.div variants={rise} className="preview">
          <span>Profit per kg is not set for your customers, so profit shows as the full sale amount.</span>
          <button type="button" className="link" onClick={() => setTab('cust')}>
            Set it in Customers
          </button>
        </motion.div>
      )}

      {/* live result strip */}
      <motion.div variants={rise} className={cx('live', liveNet >= 0 ? 'pos' : 'neg')} layout>
        <div>
          <small>Live result for the day</small>
          <b>
            <Num value={liveNet} format={(v) => inr(v, true)} duration={0.6} />
          </b>
        </div>
        <div className="live-mid">
          <span>Sales {inr(s.revenue)}</span>
          <span>Cost {inr(-s.batter)}</span>
          <span>Delivery {inr(-logistics)}</span>
        </div>
        <span className="live-tag">{liveNet >= 0 ? 'PROFIT' : 'LOSS'}</span>
      </motion.div>

      <div className="grid2 top">
        {/* DELIVERIES */}
        <motion.section variants={rise} className="card pad">
          <h3 className="h3">
            <Icon name="box" size={18} /> {f.id ? 'Edit delivery' : 'Add delivery'}
          </h3>
          <form onSubmit={addDelivery} className="form">
            <Field label="Customer / hotel">
              <select value={f.customerId} onChange={(e) => pickCustomer(e.target.value)}>
                <option value="">Select customer…</option>
                {customers.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} - {inr(x.rate)}/kg
                  </option>
                ))}
              </select>
            </Field>
            <div className="three">
              <Field label="Quantity (kg)">
                <input type="number" inputMode="decimal" min="0" step="0.5" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder="0" />
              </Field>
              <Field
                label="Rate per kg (₹)"
                hint={cust && rate !== cust.rate ? `${rate - cust.rate > 0 ? '+' : ''}${rate - cust.rate} vs usual ${inr(cust.rate)}` : 'Change for special price'}
              >
                <input type="number" inputMode="decimal" min="0" value={f.rate} onChange={(e) => onRate(e.target.value)} placeholder="0" />
              </Field>
              <Field label="My profit / kg (₹)" hint="after all costs">
                <input type="number" inputMode="decimal" value={f.profit} onChange={(e) => setF({ ...f, profit: e.target.value })} placeholder="0" />
              </Field>
            </div>

            <AnimatePresence>
              {qty > 0 && rate > 0 && (
                <motion.div
                  className="preview"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <span>
                    Bill <b>{inr(amount)}</b>
                  </span>
                  <span className={lineMargin >= 0 ? 'pos' : 'neg'}>
                    My profit <b>{inr(lineMargin, true)}</b>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="by-row">
              <Field label="Delivered by" hint="Own driver, or a hired porter / auto / bike">
                <select value={f.by} onChange={(e) => setF({ ...f, by: e.target.value })}>
                  <option value="driver">Own driver</option>
                  <option value="new:Porter">Porter (new booking)</option>
                  <option value="new:Auto">Auto (new booking)</option>
                  <option value="new:Bike">Bike (new booking)</option>
                  {todaysTrips.map((t) => (
                    <option key={t.id} value={'trip:' + t.id}>
                      Same {t.mode} as {t.customerIds.split(',').map((id) => data.customers.find((c) => c.id === id)?.name).filter(Boolean).slice(0, 2).join(', ')}
                    </option>
                  ))}
                </select>
              </Field>
              {f.by.startsWith('new:') && (
                <Field label={`${f.by.slice(4)} charge (₹)`} hint="whole booking">
                  <input type="number" inputMode="decimal" value={f.charge} onChange={(e) => setF({ ...f, charge: e.target.value })} placeholder="0" />
                </Field>
              )}
            </div>

            {!f.id && (
              <div className="paid-row">
                <label className="switch">
                  <input type="checkbox" checked={f.paid} onChange={(e) => setF({ ...f, paid: e.target.checked })} />
                  <i />
                  <span>Customer paid on delivery</span>
                </label>
                {f.paid && (
                  <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                    <option>Cash</option>
                    <option>UPI</option>
                    <option>Bank</option>
                  </select>
                )}
              </div>
            )}

            <div className="row gap">
              <button className="btn primary grow" type="submit">
                <Icon name={f.id ? 'check' : 'plus'} size={18} /> {f.id ? 'Update delivery' : 'Add delivery'}
              </button>
              {f.id && (
                <button className="btn ghost" type="button" onClick={() => setF(blank)}>
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div className="list">
            <AnimatePresence initial={false}>
              {todays.map((d) => {
                const m = d.qty * (d.rate - unitCostOf(d, data))
                const drv = data.drivers.find((x) => x.id === d.driverId)
                return (
                  <motion.div
                    key={d.id}
                    layout
                    className="li"
                    initial={{ opacity: 0, x: -24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 40, height: 0 }}
                  >
                    <div className="avatar">{d.customerName?.[0]}</div>
                    <div className="li-main">
                      <b>{d.customerName}</b>
                      <small>
                        {kgf(d.qty)} × {inr(d.rate)} · profit <span className={m >= 0 ? 'pos' : 'neg'}>{inr(m, true)}</span>
                      </small>
                    </div>
                    <b>{inr(d.qty * d.rate)}</b>
                    <span className={`chip ${PAY_CHIP[pay[d.id]?.status || 'pending']}`}>{PAY_LABEL[pay[d.id]?.status || 'pending']}</span>
                    {tripOf(d.customerId) ? (
                      <span className="chip drv clear">{tripOf(d.customerId).mode}</span>
                    ) : (
                      <button type="button" className={cx('chip drv', drv ? 'clear' : 'warn')} onClick={() => setAssignFor(d.id)} title="Choose driver">
                        {drv ? drv.name : 'Assign driver'}
                      </button>
                    )}
                    <button className="icon-btn" onClick={() => edit(d)} aria-label="Edit">
                      <Icon name="edit" size={16} />
                    </button>
                    <button className="icon-btn danger" onClick={() => delDelivery(d)} aria-label="Delete">
                      <Icon name="trash" size={16} />
                    </button>
                  </motion.div>
                )
              })}
            </AnimatePresence>
            {todays.length === 0 && <Empty icon="truck" title="No deliveries yet" text="Add the first delivery above." />}
          </div>
        </motion.section>

        {/* COSTS */}
        <motion.section variants={rise} className="card pad">
          <h3 className="h3">
            <Icon name="fuel" size={18} /> Delivery cost for the day
          </h3>
          <div className="form">
            <div className="two">
              <Field label="Driver salary (₹)">
                <input type="number" inputMode="decimal" value={c.driver} onChange={(e) => setC({ ...c, driver: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Diesel (₹)">
                <input type="number" inputMode="decimal" value={c.diesel} onChange={(e) => setC({ ...c, diesel: e.target.value })} placeholder="0" />
              </Field>
            </div>

            <Trips date={date} stats={s} />

            <div className="two">
              <Field label="Other expense (₹)">
                <input type="number" inputMode="decimal" value={c.other} onChange={(e) => setC({ ...c, other: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Note">
                <input value={c.note} onChange={(e) => setC({ ...c, note: e.target.value })} placeholder="optional" />
              </Field>
            </div>

            <div className="preview solid">
              <span>
                Total delivery cost <b>{inr(logistics)}</b>
              </span>
              <span>
                {s.kg ? `${inr(logistics / s.kg)} per kg` : 'no kg sold yet'}
              </span>
            </div>

            <div className="row gap">
              <button className="btn primary grow" onClick={saveCosts} disabled={!dirty}>
                <Icon name="check" size={18} /> {saved ? (dirty ? 'Update day cost' : 'Saved') : 'Save day cost'}
              </button>
              {saved && (
                <button className="btn ghost" onClick={deleteCosts} aria-label="Delete day cost">
                  <Icon name="trash" size={16} /> Delete
                </button>
              )}
            </div>
          </div>
        </motion.section>
      </div>

      <motion.section variants={rise} className="card pad report-card">
        <div className="row between wrap">
          <div>
            <h3 className="h3">
              <Icon name="download" size={18} /> Day report for management
            </h3>
            <p className="muted">
              PDF with kg delivered, orders and payment status, driver / diesel / porter expenses, profit or loss, and the pending customers list.
            </p>
          </div>
          <div className="row gap wrap">
            <button className="btn primary" onClick={() => makePdf(false)} disabled={!!busy || s.empty}>
              <Icon name="download" size={18} /> {busy === 'pdf' ? 'Creating…' : 'Download PDF'}
            </button>
            <button className="btn ghost" onClick={() => makePdf(true)} disabled={!!busy || s.empty}>
              <Icon name="mail" size={16} /> {busy === 'share' ? 'Preparing…' : 'Share'}
            </button>
          </div>
        </div>
        {s.empty && <p className="tiny">Add deliveries or costs for this day to enable the report.</p>}
      </motion.section>
    </motion.div>
  )
}
