import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store'
import { fmtDate, inr, sum, todayStr, uid } from '../lib/util'
import { Empty, Field, Icon, Num, rise, stagger, Tilt } from '../components/ui'

export default function Payments() {
  const { data, dues, upsert, remove, toast } = useApp()
  const [f, setF] = useState({ customerId: '', amount: '', mode: 'UPI', date: todayStr() })
  const item = dues.find((d) => d.customer.id === f.customerId)
  const recent = useMemo(
    () => [...data.payments].sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id))).slice(0, 40),
    [data.payments]
  )
  const today = todayStr()
  const collectedToday = sum(data.payments.filter((p) => p.date === today), (p) => p.amount)
  const totalDue = sum(dues, (d) => d.outstanding)

  const submit = (e) => {
    e.preventDefault()
    const amt = Number(f.amount)
    if (!item || amt <= 0) return toast('Choose a customer and amount', 'warn')
    upsert('payments', {
      id: uid(),
      date: f.date,
      customerId: item.customer.id,
      customerName: item.customer.name,
      amount: amt,
      mode: f.mode,
      note: ''
    })
    toast(`${inr(amt)} received from ${item.customer.name}`)
    setF({ ...f, customerId: '', amount: '' })
  }

  return (
    <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise}>
        <h2 className="h1">Payments</h2>
        <p className="muted">Record money received. It clears the oldest bills first.</p>
      </motion.div>

      <div className="tiles two-up">
        <Tilt variants={rise} className="tile pos">
          <span className="tile-ic"><Icon name="wallet" size={18} /></span>
          <small>Collected today</small>
          <b><Num value={collectedToday} /></b>
        </Tilt>
        <Tilt variants={rise} className="tile warn">
          <span className="tile-ic"><Icon name="alert" size={18} /></span>
          <small>Total outstanding</small>
          <b><Num value={totalDue} /></b>
        </Tilt>
      </div>

      <div className="grid2 top">
        <motion.section variants={rise} className="card pad">
          <h3 className="h3"><Icon name="plus" size={18} /> Record payment</h3>
          <form className="form" onSubmit={submit}>
            <Field label="Customer / hotel">
              <select value={f.customerId} onChange={(e) => setF({ ...f, customerId: e.target.value })}>
                <option value="">Select customer…</option>
                {dues.map((d) => (
                  <option key={d.customer.id} value={d.customer.id}>
                    {d.customer.name} {d.outstanding > 0 ? `- owes ${inr(d.outstanding)}` : '- clear'}
                  </option>
                ))}
              </select>
            </Field>
            <div className="two">
              <Field label="Amount (₹)">
                <input type="number" inputMode="decimal" min="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0" />
              </Field>
              <Field label="Mode">
                <select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                  <option>UPI</option>
                  <option>Cash</option>
                  <option>Bank</option>
                </select>
              </Field>
            </div>
            <Field label="Date">
              <input type="date" value={f.date} max={today} onChange={(e) => setF({ ...f, date: e.target.value })} />
            </Field>
            <AnimatePresence>
              {item && (
                <motion.div className="preview" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <span>
                    Outstanding <b>{inr(item.outstanding)}</b>
                  </span>
                  {item.outstanding > 0 && (
                    <button type="button" className="link" onClick={() => setF({ ...f, amount: Math.round(item.outstanding) })}>
                      Fill full amount
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            <button className="btn primary" type="submit">
              <Icon name="check" size={18} /> Save payment
            </button>
          </form>
        </motion.section>

        <motion.section variants={rise} className="card pad">
          <h3 className="h3">Recent payments</h3>
          <div className="list">
            <AnimatePresence initial={false}>
              {recent.map((p) => (
                <motion.div key={p.id} layout className="li" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40, height: 0 }}>
                  <div className="avatar ok">{p.customerName?.[0]}</div>
                  <div className="li-main">
                    <b>{p.customerName}</b>
                    <small>
                      {fmtDate(p.date)} · {p.mode}
                      {p.note ? ` · ${p.note}` : ''}
                    </small>
                  </div>
                  <b className="pos">{inr(p.amount)}</b>
                  <button className="icon-btn danger" onClick={() => remove('payments', p.id)} aria-label="Delete">
                    <Icon name="trash" size={16} />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
            {recent.length === 0 && <Empty icon="wallet" title="No payments yet" />}
          </div>
        </motion.section>
      </div>
    </motion.div>
  )
}
