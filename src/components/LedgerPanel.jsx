import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import { periodRange, periodLabel } from '../lib/calc'
import { cx, inr, todayStr } from '../lib/util'
import { Icon, rise } from './ui'

const MODES = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['custom', 'Custom'], ['all', 'All']]

/** Pick customers (highest pending first) and download Tally-style ledgers for a day / week / month / custom range. */
export default function LedgerPanel() {
  const { data, dues, toast } = useApp()
  const [open, setOpen] = useState(true)
  const [mode, setMode] = useState('month')
  const [anchor, setAnchor] = useState(todayStr())
  const [cf, setCf] = useState(todayStr())
  const [ct, setCt] = useState(todayStr())
  const [sel, setSel] = useState({})
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState('')
  const rows = useMemo(() => [...dues].sort((a, b) => b.outstanding - a.outstanding || a.customer.name.localeCompare(b.customer.name)), [dues])
  const shown = rows.filter((d) => !q || `${d.customer.name} ${d.customer.area || ''}`.toLowerCase().includes(q.toLowerCase()))
  const ids = Object.keys(sel).filter((k) => sel[k])
  const range = mode === 'all' ? { start: '', end: todayStr() } : mode === 'custom' ? { start: cf, end: ct } : periodRange(mode, anchor)
  const label = mode === 'all' ? 'All time' : mode === 'custom' ? `${cf} to ${ct}` : periodLabel(mode, range.start, range.end)
  const pendingCount = rows.filter((d) => d.outstanding > 0.5).length
  const toggle = (id) => setSel((s) => ({ ...s, [id]: !s[id] }))
  const top = (n) => setSel(Object.fromEntries(rows.filter((d) => d.outstanding > 0.5).slice(0, n).map((d) => [d.customer.id, true])))

  const run = async (share) => {
    if (!ids.length) return toast('Select at least one customer', 'warn')
    if (mode === 'custom' && (!cf || !ct || cf > ct)) return toast('Choose a valid From and To date', 'warn')
    setBusy(share ? 'share' : 'pdf')
    try {
      const [{ buildLedgerPdf }, { sharePdf }] = await Promise.all([import('../lib/ledgerPdf'), import('../lib/report')])
      const customers = rows.filter((d) => sel[d.customer.id]).map((d) => d.customer)
      const { doc, filename } = await buildLedgerPdf({ customers, from: range.start, to: range.end, data })
      if (share) {
        const r = await sharePdf(doc, filename, `Account ledger ${label}`)
        if (r === 'downloaded') toast('Sharing not supported here - PDF downloaded instead')
      } else {
        doc.save(filename)
        toast(`Ledger downloaded (${customers.length} customer${customers.length === 1 ? '' : 's'})`)
      }
    } catch (e) {
      toast(e.message, 'bad')
    }
    setBusy('')
  }

  return (
    <motion.section variants={rise} className="card pad ledger">
      <button type="button" className="row between ledger-head" onClick={() => setOpen((v) => !v)}>
        <div>
          <h3 className="h3">Customer ledgers (Tally style)</h3>
          <p className="muted">{pendingCount} customer{pendingCount === 1 ? '' : 's'} with pending payment · highest pending first</p>
        </div>
        <Icon name={open ? 'up' : 'down'} size={18} />
      </button>
      {open && (
        <div className="stack" style={{ marginTop: 14 }}>
          <div className="seg">
            {MODES.map(([k, t]) => (
              <button key={k} type="button" className={cx(mode === k && 'on')} onClick={() => setMode(k)}>
                {mode === k && <motion.i layoutId="ledseg" className="seg-pill" transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
                <span>{t}</span>
              </button>
            ))}
          </div>
          {(mode === 'day' || mode === 'week' || mode === 'month') && (
            <div className="row gap wrap">
              <label className="muted">{mode === 'day' ? 'Date' : mode === 'week' ? 'Any date in the week' : 'Any date in the month'}</label>
              <input type="date" value={anchor} max={todayStr()} onChange={(e) => setAnchor(e.target.value)} />
            </div>
          )}
          {mode === 'custom' && (
            <div className="row gap wrap">
              <label className="muted">From</label>
              <input type="date" value={cf} max={todayStr()} onChange={(e) => setCf(e.target.value)} />
              <label className="muted">To</label>
              <input type="date" value={ct} max={todayStr()} onChange={(e) => setCt(e.target.value)} />
            </div>
          )}
          <p className="muted">Period: <b>{label}</b> (opening balance is carried forward automatically)</p>
          <div className="row gap wrap">
            <input className="search" placeholder="Search customer…" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="button" className="btn ghost sm" onClick={() => top(10)}>Top 10 pending</button>
            <button type="button" className="btn ghost sm" onClick={() => setSel(Object.fromEntries(shown.map((d) => [d.customer.id, true])))}>Select shown</button>
            <button type="button" className="btn ghost sm" onClick={() => setSel({})}>Clear</button>
          </div>
          <div className="ledger-list">
            {shown.map((d) => (
              <label key={d.customer.id} className={cx('ledger-row', sel[d.customer.id] && 'on')}>
                <input type="checkbox" checked={!!sel[d.customer.id]} onChange={() => toggle(d.customer.id)} />
                <span className="ledger-name">
                  <b>{d.customer.name}</b>
                  <small>{d.customer.area || ''}{d.daysUnpaid > 0 ? `${d.customer.area ? ' · ' : ''}${d.daysUnpaid} days unpaid` : ''}</small>
                </span>
                <b className={d.outstanding > 0.5 ? 'neg' : 'pos'}>{d.outstanding > 0.5 ? inr(d.outstanding) : 'Clear'}</b>
              </label>
            ))}
          </div>
          <div className="row gap wrap">
            <button className="btn primary" disabled={!ids.length || !!busy} onClick={() => run(false)}>
              <Icon name="download" size={16} /> {busy === 'pdf' ? 'Creating…' : `Download ledger${ids.length ? ` (${ids.length})` : ''}`}
            </button>
            <button className="btn ghost" disabled={!ids.length || !!busy} onClick={() => run(true)}>
              <Icon name="mail" size={16} /> Share
            </button>
          </div>
        </div>
      )}
    </motion.section>
  )
}
