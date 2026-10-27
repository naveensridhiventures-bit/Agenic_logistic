import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store'
import { dayStats } from '../lib/calc'
import { cx, inr, kgf, uid } from '../lib/util'
import { DateNav, Empty, Field, Icon, Num, rise, stagger } from '../components/ui'

const blank = { id: null, customerId: '', qty: '', rate: '', paid: false, mode: 'Cash' }

export default function Entry() {
  const { data, date, upsert, remove, toast, setTab } = useApp()
  const { settings } = data
  const s = useMemo(() => dayStats(date, data), [data, date])
  const customers = data.customers.filter((c) => c.active !== false)
  const todays = data.deliveries.filter((d) => d.date === date)
  const saved = data.costs.find((c) => c.date === date)

  // ---------- delivery form ----------
  const [f, setF] = useState(blank)
  const cust = data.customers.find((c) => c.id === f.customerId)
  const qty = Number(f.qty) || 0
  const rate = Number(f.rate) || 0
  const amount = qty * rate
  const editing = todays.find((d) => d.id === f.id)
  const unitCost = editing?.cost || settings.costPerKg
  const lineMargin = qty * (rate - unitCost)

  const pickCustomer = (id) => {
    const c = data.customers.find((x) => x.id === id)
    setF((p) => ({ ...p, customerId: id, rate: c ? c.rate : '' }))
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
  }
  const edit = (d) => setF({ id: d.id, customerId: d.customerId, qty: d.qty, rate: d.rate, paid: false, mode: 'Cash' })

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
  const logistics = n(c.driver) + n(c.diesel) + (c.porterBooked ? n(c.porter) : 0) + n(c.other)
  const liveNet = s.margin - logistics
  const dirty =
    !saved ||
    n(saved.driver) !== n(c.driver) ||
    n(saved.diesel) !== n(c.diesel) ||
    n(saved.porter) !== (c.porterBooked ? n(c.porter) : 0) ||
    n(saved.other) !== n(c.other) ||
    (saved.note || '') !== c.note

  const saveCosts = () => {
    upsert('costs', {
      id: date,
      date,
      driver: n(c.driver),
      diesel: n(c.diesel),
      porter: c.porterBooked ? n(c.porter) : 0,
      other: n(c.other),
      porterBooked: c.porterBooked,
      note: c.note
    })
    toast(liveNet >= 0 ? `Saved - ${inr(liveNet)} profit for the day` : `Saved - ${inr(liveNet)} loss for the day`, liveNet >= 0 ? 'ok' : 'warn')
  }

  return (
    <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise} className="row between wrap">
        <div>
          <h2 className="h1">Daily entry</h2>
          <p className="muted">Record deliveries and what it cost to deliver them.</p>
        </div>
        <DateNav />
      </motion.div>

      {customers.length === 0 && (
        <motion.div variants={rise} className="preview solid">
          <span>No customers yet. Import your hotels first.</span>
          <button type="button" className="link" onClick={() => setTab('cust')}>
            Go to Customers
          </button>
        </motion.div>
      )}

      {Number(settings.costPerKg) === 0 && (
        <motion.div variants={rise} className="preview">
          <span>Batter cost per kg is not set, so profit is overstated.</span>
          <button type="button" className="link" onClick={() => setTab('set')}>
            Set it in Settings
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
          <span>Batter {inr(-s.batter)}</span>
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
            <div className="two">
              <Field label="Quantity (kg)">
                <input type="number" inputMode="decimal" min="0" step="0.5" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder="0" />
              </Field>
              <Field
                label="Rate per kg (₹)"
                hint={cust && rate !== cust.rate ? `${rate - cust.rate > 0 ? '+' : ''}${rate - cust.rate} vs usual ${inr(cust.rate)}` : 'Change for special price'}
              >
                <input type="number" inputMode="decimal" min="0" value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value })} placeholder="0" />
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
                    Batter margin <b>{inr(lineMargin, true)}</b>
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

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
                const m = d.qty * (d.rate - (d.cost || settings.costPerKg))
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
                        {kgf(d.qty)} × {inr(d.rate)} · margin <span className={m >= 0 ? 'pos' : 'neg'}>{inr(m, true)}</span>
                      </small>
                    </div>
                    <b>{inr(d.qty * d.rate)}</b>
                    <button className="icon-btn" onClick={() => edit(d)} aria-label="Edit">
                      <Icon name="edit" size={16} />
                    </button>
                    <button className="icon-btn danger" onClick={() => remove('deliveries', d.id)} aria-label="Delete">
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

            <label className="switch">
              <input type="checkbox" checked={c.porterBooked} onChange={(e) => setC({ ...c, porterBooked: e.target.checked })} />
              <i />
              <span>Porter booked today</span>
            </label>
            <AnimatePresence>
              {c.porterBooked && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                  <Field label="Porter charge (₹)">
                    <input type="number" inputMode="decimal" value={c.porter} onChange={(e) => setC({ ...c, porter: e.target.value })} placeholder="0" />
                  </Field>
                </motion.div>
              )}
            </AnimatePresence>

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

            <button className="btn primary" onClick={saveCosts} disabled={!dirty}>
              <Icon name="check" size={18} /> {saved ? (dirty ? 'Update day cost' : 'Saved') : 'Save day cost'}
            </button>
          </div>
        </motion.section>
      </div>
    </motion.div>
  )
}
