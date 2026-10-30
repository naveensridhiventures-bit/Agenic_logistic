import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import { addDays, cx, todayStr } from '../lib/util'
import { Icon } from './ui'

export default function CashReport({ defFrom, defTo, onClose }) {
  const { data, toast } = useApp()
  const [from, setFrom] = useState(defFrom)
  const [to, setTo] = useState(defTo)
  const [amounts, setAmounts] = useState(true)
  const [busy, setBusy] = useState('')
  const active = useMemo(() => {
    const ids = new Set()
    data.deliveries.forEach((d) => d.date >= from && d.date <= to && ids.add(d.customerId))
    data.payments.forEach((p) => p.date >= from && p.date <= to && ids.add(p.customerId))
    return data.customers.filter((c) => ids.has(c.id)).sort((a, b) => a.name.localeCompare(b.name))
  }, [data, from, to])
  const [off, setOff] = useState(() => new Set())
  const chosen = active.filter((c) => !off.has(c.id))
  const toggle = (id) => setOff((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const quick = (a, b) => { setFrom(a); setTo(b) }
  const t = todayStr()

  const run = async (share) => {
    if (!chosen.length) return toast('Pick at least one customer', 'bad')
    setBusy(share ? 'share' : 'dl')
    try {
      const [{ buildCashPdf }, { sharePdf }] = await Promise.all([import('../lib/cashReport'), import('../lib/report')])
      const { doc, filename } = await buildCashPdf({ customers: chosen, from, to, data, showAmounts: amounts })
      if (share) {
        const r = await sharePdf(doc, filename, `Agenic cash received ${from} to ${to}`)
        if (r === 'downloaded') toast('Sharing not supported here - PDF downloaded instead')
      } else {
        doc.save(filename)
        toast('PDF downloaded')
      }
    } catch (e) {
      toast(`Could not create PDF: ${e.message}`, 'bad')
    }
    setBusy('')
  }

  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="modal wide" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} onClick={(e) => e.stopPropagation()}>
        <div className="row between">
          <h3 className="h2">Cash received report</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button>
        </div>
        <p className="muted">Date-wise grid for management: R = cash received, NR = delivered but not received.</p>
        <div className="seg">
          <button onClick={() => quick(t, t)}>Today</button>
          <button onClick={() => quick(addDays(t, -6), t)}>Last 7 days</button>
          <button onClick={() => quick(t.slice(0, 8) + '01', t)}>This month</button>
        </div>
        <div className="two">
          <label className="field"><span>From</span><input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} /></label>
          <label className="field"><span>To</span><input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></label>
        </div>
        <div className="row between wrap" style={{ marginTop: 10 }}>
          <b>Customers in the report ({chosen.length}/{active.length})</b>
          <span className="row gap">
            <button className="btn ghost" onClick={() => setOff(new Set())}>All</button>
            <button className="btn ghost" onClick={() => setOff(new Set(active.map((c) => c.id)))}>None</button>
          </span>
        </div>
        <div className="cr-chips">
          {active.map((c) => (
            <button key={c.id} className={cx('cr-chip', !off.has(c.id) && 'on')} onClick={() => toggle(c.id)}>{c.name}</button>
          ))}
          {!active.length && <small className="muted">No deliveries or payments in these dates.</small>}
        </div>
        <label className="row gap" style={{ marginTop: 10 }}>
          <input type="checkbox" checked={amounts} onChange={(e) => setAmounts(e.target.checked)} style={{ width: 18 }} /> Show amount under R / NR
        </label>
        <div className="modal-actions">
          <button className="btn ghost" onClick={() => run(true)} disabled={!!busy}><Icon name="mail" size={16} /> {busy === 'share' ? 'Preparing…' : 'Share'}</button>
          <button className="btn primary" onClick={() => run(false)} disabled={!!busy}><Icon name="download" size={18} /> {busy === 'dl' ? 'Creating…' : 'Download PDF'}</button>
        </div>
      </motion.div>
    </motion.div>
  )
}
