import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import { dayStats } from '../lib/calc'
import { addDays, cx, fmtDate, inr, kgf, sum, todayStr } from '../lib/util'
import { Icon, Num, rise, stagger, Tilt } from '../components/ui'

export default function Reports() {
  const { data, setDate, setTab } = useApp()
  const [range, setRange] = useState(14)
  const rows = useMemo(() => {
    const t = todayStr()
    return Array.from({ length: range }, (_, i) => dayStats(addDays(t, -i), data)).filter((r) => !r.empty)
  }, [data, range])

  const tot = {
    kg: sum(rows, (r) => r.kg),
    revenue: sum(rows, (r) => r.revenue),
    batter: sum(rows, (r) => r.batter),
    logistics: sum(rows, (r) => r.logistics),
    net: sum(rows, (r) => r.net)
  }
  const lossDays = rows.filter((r) => r.net < 0)
  const best = rows.reduce((a, r) => (!a || r.net > a.net ? r : a), null)
  const worst = rows.reduce((a, r) => (!a || r.net < a.net ? r : a), null)

  const csv = () => {
    const head = ['Date', 'Kg', 'Sales', 'Batter cost', 'Driver', 'Diesel', 'Porter', 'Other', 'Net']
    const lines = rows.map((r) => [r.date, r.kg, r.revenue, r.batter, r.driver, r.diesel, r.porter, r.other, Math.round(r.net)].join(','))
    const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `agenic-pl-${todayStr()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise} className="row between wrap">
        <div>
          <h2 className="h1">Reports</h2>
          <p className="muted">Daily profit and loss across a period.</p>
        </div>
        <div className="row gap">
          <div className="seg">
            {[7, 14, 30].map((n) => (
              <button key={n} className={cx(range === n && 'on')} onClick={() => setRange(n)}>
                {range === n && <motion.i layoutId="rseg" className="seg-pill" />}
                <span>{n} days</span>
              </button>
            ))}
          </div>
          <button className="btn ghost" onClick={csv} disabled={!rows.length}>
            <Icon name="download" size={16} /> CSV
          </button>
        </div>
      </motion.div>

      <div className="tiles">
        <Tilt variants={rise} className={cx('tile', tot.net >= 0 ? 'pos' : 'neg')}>
          <span className="tile-ic"><Icon name={tot.net >= 0 ? 'up' : 'down'} size={18} /></span>
          <small>Net {tot.net >= 0 ? 'profit' : 'loss'}</small>
          <b><Num value={tot.net} format={(v) => inr(v, true)} /></b>
        </Tilt>
        <Tilt variants={rise} className="tile accent">
          <span className="tile-ic"><Icon name="box" size={18} /></span>
          <small>Sales · {kgf(tot.kg)}</small>
          <b><Num value={tot.revenue} /></b>
        </Tilt>
        <Tilt variants={rise} className="tile warn">
          <span className="tile-ic"><Icon name="truck" size={18} /></span>
          <small>Delivery cost</small>
          <b><Num value={tot.logistics} /></b>
        </Tilt>
        <Tilt variants={rise} className={cx('tile', lossDays.length ? 'neg' : 'pos')}>
          <span className="tile-ic"><Icon name="alert" size={18} /></span>
          <small>Loss days</small>
          <b><Num value={lossDays.length} format={(v) => `${Math.round(v)} of ${rows.length}`} /></b>
        </Tilt>
      </div>

      {best && worst && rows.length > 1 && (
        <motion.div variants={rise} className="grid2">
          <div className="card pad insight pos">
            <small>Best day</small>
            <b>{fmtDate(best.date, { weekday: 'long', day: 'numeric', month: 'short' })}</b>
            <span>{inr(best.net, true)}</span>
          </div>
          <div className="card pad insight neg">
            <small>Toughest day</small>
            <b>{fmtDate(worst.date, { weekday: 'long', day: 'numeric', month: 'short' })}</b>
            <span>{inr(worst.net, true)}</span>
          </div>
        </motion.div>
      )}

      <motion.section variants={rise} className="card pad">
        <h3 className="h3">Day by day</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Kg</th>
                <th>Sales</th>
                <th>Batter</th>
                <th>Delivery</th>
                <th>Net</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <motion.tr
                  key={r.date}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i, 12) * 0.03 }}
                  onClick={() => {
                    setDate(r.date)
                    setTab('dash')
                  }}
                  className="click"
                >
                  <td>{fmtDate(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                  <td>{Math.round(r.kg)}</td>
                  <td>{inr(r.revenue)}</td>
                  <td>{inr(r.batter)}</td>
                  <td>{inr(r.logistics)}</td>
                  <td>
                    <span className={cx('net-chip', r.net >= 0 ? 'pos' : 'neg')}>{inr(r.net, true)}</span>
                  </td>
                </motion.tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{Math.round(tot.kg)}</td>
                  <td>{inr(tot.revenue)}</td>
                  <td>{inr(tot.batter)}</td>
                  <td>{inr(tot.logistics)}</td>
                  <td>
                    <span className={cx('net-chip', tot.net >= 0 ? 'pos' : 'neg')}>{inr(tot.net, true)}</span>
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </motion.section>
    </motion.div>
  )
}
