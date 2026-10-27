import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store'
import { deliveryPayStatus, PAY_CHIP, PAY_LABEL, periodLabel, periodRange, periodRows, shiftPeriod, sumRows } from '../lib/calc'
import { cx, fmtDate, inr, kgf, sum, todayStr } from '../lib/util'
import { Empty, Icon, Num, rise, stagger, StatusChip, Tilt } from '../components/ui'

const MODES = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month']
]

export default function Orders() {
  const { data, dues, setDate, setTab, toast } = useApp()
  const [mode, setMode] = useState('week')
  const [anchor, setAnchor] = useState(todayStr())
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState('')

  const pay = useMemo(() => deliveryPayStatus(data), [data])
  const { start, end } = periodRange(mode, anchor)
  const rows = useMemo(() => periodRows(start, end, data, pay), [data, pay, start, end])
  const T = useMemo(() => sumRows(rows), [rows])
  const shown = rows.filter((r) => (filter === 'all' ? true : filter === 'paid' ? r.status === 'paid' : r.status === 'part' || r.status === 'pending'))
  const pending = dues.filter((d) => d.outstanding > 0.5).sort((a, b) => b.outstanding - a.outstanding)
  const totalPending = sum(pending, (d) => d.outstanding)
  const atEnd = end >= todayStr()

  const go = (n) => setAnchor(shiftPeriod(mode, anchor, n))

  const makePdf = async (share) => {
    setBusy(share ? 'share' : 'pdf')
    try {
      const { buildReport, sharePdf } = await import('../lib/report')
      const { doc, filename, summary } = await buildReport({ mode, anchor, data })
      if (share) {
        const r = await sharePdf(doc, filename, `Agenic ${mode}ly report: ${inr(summary.net, true)} net, ${inr(summary.pending)} pending`)
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

  const csv = () => {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const head = ['Date', 'Customer', 'Kg', 'Rate', 'Amount', 'Paid', 'Pending', 'Status']
    const lines = [...rows].reverse().flatMap((r) =>
      r.deliveries.map((d) => [r.date, d.customerName, d.qty, d.rate, Math.round(d.pay.amount), Math.round(d.pay.paid), Math.round(d.pay.due), PAY_LABEL[d.pay.status]].map(q).join(','))
    )
    const costs = ['', '', '', '', '', '', '', ''].join(',')
    const dayLines = [...rows].reverse().map((r) => [r.date, 'DAY TOTAL', r.kg, '', Math.round(r.revenue), Math.round(r.paid), Math.round(r.due), `Driver ${r.driver} | Diesel ${r.diesel} | Porter ${r.porter} | Other ${r.other} | Net ${Math.round(r.net)}`].map(q).join(','))
    const blob = new Blob([[head.join(','), ...lines, costs, ...dayLines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `agenic-orders-${start}_to_${end}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const dayPdf = async (date) => {
    setBusy(date)
    try {
      const { buildReport } = await import('../lib/report')
      const { doc, filename } = await buildReport({ mode: 'day', anchor: date, data })
      doc.save(filename)
    } catch (e) {
      toast(`Could not create PDF: ${e.message}`, 'bad')
    }
    setBusy('')
  }

  return (
    <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise} className="row between wrap">
        <div>
          <h2 className="h1">Orders &amp; reports</h2>
          <p className="muted">Date-wise orders, expenses and whether each day is paid.</p>
        </div>
        <div className="row gap wrap">
          <button className="btn primary" onClick={() => makePdf(false)} disabled={!!busy || !rows.length}>
            <Icon name="download" size={18} /> {busy === 'pdf' ? 'Creating…' : 'PDF report'}
          </button>
          <button className="btn ghost" onClick={() => makePdf(true)} disabled={!!busy || !rows.length}>
            <Icon name="mail" size={16} /> {busy === 'share' ? 'Preparing…' : 'Share'}
          </button>
          <button className="btn ghost" onClick={csv} disabled={!rows.length}>
            CSV
          </button>
        </div>
      </motion.div>

      <motion.div variants={rise} className="row between wrap toolbar">
        <div className="seg">
          {MODES.map(([k, l]) => (
            <button key={k} className={cx(mode === k && 'on')} onClick={() => { setMode(k); setOpen(null) }}>
              {mode === k && <motion.i layoutId="omode" className="seg-pill" />}
              <span>{l}</span>
            </button>
          ))}
        </div>
        <div className="datenav">
          <button className="icon-btn" onClick={() => go(-1)} aria-label="Previous">
            <Icon name="left" size={18} />
          </button>
          <span className="date-pill period">{periodLabel(mode, start, end)}</span>
          <button className="icon-btn" disabled={atEnd} onClick={() => go(1)} aria-label="Next">
            <Icon name="right" size={18} />
          </button>
        </div>
      </motion.div>

      <div className="tiles">
        <Tilt variants={rise} className={cx('tile', T.net >= 0 ? 'pos' : 'neg')}>
          <span className="tile-ic"><Icon name={T.net >= 0 ? 'up' : 'down'} size={18} /></span>
          <small>Net {T.net >= 0 ? 'profit' : 'loss'}</small>
          <b><Num key={start + mode} value={T.net} format={(v) => inr(v, true)} /></b>
        </Tilt>
        <Tilt variants={rise} className="tile accent">
          <span className="tile-ic"><Icon name="box" size={18} /></span>
          <small>{kgf(T.kg)} · {T.orders} orders</small>
          <b><Num key={start + mode} value={T.revenue} /></b>
        </Tilt>
        <Tilt variants={rise} className="tile warn">
          <span className="tile-ic"><Icon name="truck" size={18} /></span>
          <small>Delivery expense</small>
          <b><Num key={start + mode} value={T.logistics} /></b>
        </Tilt>
        <Tilt variants={rise} className={cx('tile', T.due > 0.5 ? 'neg' : 'pos')}>
          <span className="tile-ic"><Icon name="wallet" size={18} /></span>
          <small>Unpaid · paid {inr(T.paid)}</small>
          <b><Num key={start + mode} value={T.due} /></b>
        </Tilt>
      </div>

      <motion.div variants={rise} className="row between wrap">
        <h3 className="h3">Date-wise orders</h3>
        <div className="seg">
          {[['all', 'All'], ['pending', 'Unpaid'], ['paid', 'Paid']].map(([k, l]) => (
            <button key={k} className={cx(filter === k && 'on')} onClick={() => setFilter(k)}>
              {filter === k && <motion.i layoutId="ofilter" className="seg-pill" />}
              <span>{l}</span>
            </button>
          ))}
        </div>
      </motion.div>

      <div className="orows">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((r, i) => {
            const isOpen = open === r.date
            const pct = r.billed ? Math.min(100, (r.paid / r.billed) * 100) : 0
            return (
              <motion.div
                key={r.date + mode}
                layout
                className={cx('card orow', r.status)}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ delay: Math.min(i, 8) * 0.04, type: 'spring', damping: 24, stiffness: 260 }}
              >
                <button className="orow-head" onClick={() => setOpen(isOpen ? null : r.date)} aria-expanded={isOpen}>
                  <div className="odate">
                    <b>{fmtDate(r.date, { day: 'numeric' })}</b>
                    <small>{fmtDate(r.date, { month: 'short', weekday: 'short' })}</small>
                  </div>
                  <div className="ometa">
                    <b>{kgf(r.kg)} · {r.count} order{r.count === 1 ? '' : 's'}</b>
                    <small>Sales {inr(r.revenue)} · Expense {inr(r.logistics)}</small>
                  </div>
                  <div className="oright">
                    <span className={cx('net-chip', r.net >= 0 ? 'pos' : 'neg')}>{inr(r.net, true)}</span>
                    <span className={cx('chip', PAY_CHIP[r.status])}>{PAY_LABEL[r.status]}</span>
                  </div>
                  <motion.span className="chev" animate={{ rotate: isOpen ? 90 : 0 }}>
                    <Icon name="right" size={16} />
                  </motion.span>
                </button>

                <div className="paybar" title={`Paid ${inr(r.paid)} of ${inr(r.billed)}`}>
                  <motion.i initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }} />
                  <span>
                    Paid {inr(r.paid)} <em>·</em> Pending {inr(r.due)}
                  </span>
                </div>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      className="obody"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.28 }}
                    >
                      <div className="costchips">
                        {[['Driver', r.driver], ['Diesel', r.diesel], ['Porter', r.porter], ['Other', r.other]].map(([k, v]) => (
                          <span key={k}>
                            {k} <b>{inr(v)}</b>
                          </span>
                        ))}
                        <span className="grow" />
                        <span>
                          Collected today <b className="pos">{inr(r.collected)}</b>
                        </span>
                      </div>
                      {r.deliveries.map((d) => (
                        <div key={d.id} className="ditem">
                          <div className="li-main">
                            <b>{d.customerName}</b>
                            <small>{kgf(d.qty)} × {inr(d.rate)}</small>
                          </div>
                          <b>{inr(d.pay.amount)}</b>
                          <span className={cx('chip', PAY_CHIP[d.pay.status])}>{d.pay.status === 'part' ? `${inr(d.pay.due)} due` : PAY_LABEL[d.pay.status]}</span>
                        </div>
                      ))}
                      {r.deliveries.length === 0 && <p className="muted tiny">No orders this day (expenses only).</p>}
                      <div className="row gap wrap">
                        <button className="btn ghost sm" onClick={() => dayPdf(r.date)} disabled={!!busy}>
                          <Icon name="download" size={15} /> {busy === r.date ? 'Creating…' : 'Day PDF'}
                        </button>
                        <button className="btn ghost sm" onClick={() => { setDate(r.date); setTab('entry') }}>
                          <Icon name="edit" size={15} /> Edit this day
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
      {shown.length === 0 && (
        <Empty icon="truck" title={rows.length ? 'Nothing matches this filter' : 'No orders in this period'} text={rows.length ? 'Try “All”.' : 'Use the arrows to move to another date range, or add today’s entry.'} />
      )}

      <motion.section variants={rise} className="card pad">
        <div className="row between wrap">
          <h3 className="h3">Pending customers</h3>
          <span className="muted tiny">
            {pending.length} customers · total <b className="neg">{inr(totalPending)}</b>
          </span>
        </div>
        <div className="list" style={{ marginTop: 6 }}>
          {pending.slice(0, 12).map((d) => (
            <div key={d.customer.id} className="li">
              <div className={cx('avatar', d.status === 'breach' ? 'bad' : d.status === 'warn' ? 'warn' : '')}>{d.customer.name[0]}</div>
              <div className="li-main">
                <b>{d.customer.name}</b>
                <small>{d.customer.area || '—'} · oldest bill {fmtDate(d.oldest)} · {d.daysUnpaid}d</small>
              </div>
              <StatusChip status={d.status} />
              <b className="neg">{inr(d.outstanding)}</b>
            </div>
          ))}
          {pending.length === 0 && <Empty icon="check" title="Everyone has paid" />}
          {pending.length > 12 && <p className="muted tiny">+ {pending.length - 12} more - the PDF lists all of them.</p>}
        </div>
      </motion.section>
    </motion.div>
  )
}
