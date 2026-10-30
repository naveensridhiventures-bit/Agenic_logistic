import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store'
import { dayStats, trendData } from '../lib/calc'
import { cx, fmtLong, inr, kgf, sum, todayStr } from '../lib/util'
import { DateNav, Empty, Icon, Num, rise, Ring, stagger, StatusChip, Tilt } from '../components/ui'
import Chart from '../components/Chart'

function verdictText(s) {
  if (s.kg === 0 && s.logistics > 0) return `No sales yet, but ${inr(s.logistics)} of delivery cost is booked.`
  if (s.net >= 0)
    return `Your profit ${inr(s.margin)} covers delivery cost ${inr(s.logistics)} and leaves ${inr(s.net)} net.`
  if (s.margin <= 0) return `No profit is set on today's orders - add profit per kg for your customers.`
  return `Delivery cost ${inr(s.logistics)} is more than your profit ${inr(s.margin)}. About ${Math.ceil(
    s.shortKg || 0
  )} kg more would have broken even.`
}

export default function Dashboard() {
  const { data, date, setDate, dues, setTab, setPopup } = useApp()
  const s = useMemo(() => dayStats(date, data), [data, date])
  const trend = useMemo(() => trendData(data, date, 7), [data, date])
  const totalDue = sum(dues, (d) => d.outstanding)
  const watch = dues.filter((d) => d.outstanding > 0)
  const profit = s.net >= 0

  const flow = [
    { k: 'Sales', v: s.revenue, tone: 'pos', ic: 'box' },
    { k: 'Product cost', v: -s.batter, tone: 'neg', ic: 'box' },
    { k: 'Driver salary', v: -s.driver, tone: 'neg', ic: 'truck' },
    { k: 'Loadman salary', v: -s.loadman, tone: 'neg', ic: 'truck' },
    { k: 'Helper', v: -s.helper, tone: 'neg', ic: 'truck' },
    { k: 'Diesel', v: -s.diesel, tone: 'neg', ic: 'fuel' },
    { k: 'Porter', v: -s.porter, tone: 'neg', ic: 'truck' },
    { k: 'Maintenance', v: -s.maintenance, tone: 'neg', ic: 'wallet' },
    { k: 'Other', v: -s.other, tone: 'neg', ic: 'wallet' }
  ]
  const maxFlow = Math.max(1, s.revenue, s.batter + s.logistics)
  const ratio = s.margin > 0 ? s.logistics / s.margin : s.logistics > 0 ? 2 : 0

  return (
    <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise} className="row between wrap">
        <div>
          <h2 className="h1">{fmtLong(date)}</h2>
          <p className="muted">{date === todayStr() ? "Today's delivery result" : 'Past day result'}</p>
        </div>
        <DateNav />
      </motion.div>

      {/* HERO */}
      <motion.section variants={rise} className={cx('hero', s.empty ? 'idle' : profit ? 'profit' : 'loss')}>
        <div className="hero-glow" />
        <div className="hero-sheen" />
        {s.empty ? (
          <div className="hero-empty">
            <Icon name="truck" size={34} />
            <h3>No entries for this day yet</h3>
            <p>Add deliveries and the day's costs to see profit or loss.</p>
            <button className="btn primary" onClick={() => setTab('entry')}>
              <Icon name="plus" size={18} /> Add today's entry
            </button>
          </div>
        ) : (
          <>
            <AnimatePresence mode="wait">
              <motion.div
                key={profit ? 'p' : 'l'}
                className="verdict"
                initial={{ y: 14, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -14, opacity: 0 }}
              >
                <motion.span
                  animate={{ y: profit ? [0, -3, 0] : [0, 3, 0] }}
                  transition={{ repeat: Infinity, duration: 1.6 }}
                  className="verdict-ic"
                >
                  <Icon name={profit ? 'up' : 'down'} size={18} stroke={2.6} />
                </motion.span>
                {profit ? 'PROFIT DAY' : 'LOSS DAY'}
              </motion.div>
            </AnimatePresence>
            <div className="hero-num">
              <Num value={s.net} format={(v) => inr(v, true)} />
            </div>
            <p className="hero-sub">{verdictText(s)}</p>

            <div className="hero-meter">
              <div className="row between tiny-row">
                <span>Delivery cost vs your profit</span>
                <b>{s.margin > 0 ? `${Math.round(ratio * 100)}%` : '—'}</b>
              </div>
              <div className="track">
                <motion.i
                  className={ratio > 1 ? 'neg' : ratio > 0.7 ? 'warn' : 'pos'}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, ratio * 100)}%` }}
                  transition={{ duration: 1.2, ease: [0.2, 0.8, 0.2, 1] }}
                />
              </div>
            </div>

            <div className="hero-stats">
              <div>
                <small>Sold</small>
                <b>{kgf(s.kg)}</b>
              </div>
              <div>
                <small>Margin / kg</small>
                <b>{inr(s.marginPerKg)}</b>
              </div>
              <div>
                <small>Delivery / kg</small>
                <b>{inr(s.logisticsPerKg)}</b>
              </div>
              <div>
                <small>Deliveries</small>
                <b>{s.count}</b>
              </div>
            </div>
          </>
        )}
      </motion.section>

      {/* TILES */}
      <motion.div variants={stagger} className="tiles">
        {[
          { l: 'Sales', v: s.revenue, ic: 'box', c: 'accent' },
          { l: 'Product cost', v: s.batter, ic: 'box', c: 'muted' },
          { l: 'Delivery cost', v: s.logistics, ic: 'truck', c: 'warn' },
          { l: 'Collected today', v: s.collected, ic: 'wallet', c: 'pos' }
        ].map((t) => (
          <Tilt key={t.l} variants={rise} className={cx('tile', t.c)}>
            <span className="tile-ic">
              <Icon name={t.ic} size={18} />
            </span>
            <small>{t.l}</small>
            <b>
              <Num value={t.v} />
            </b>
          </Tilt>
        ))}
      </motion.div>

      <div className="grid2">
        {/* FLOW */}
        <motion.section variants={rise} className="card pad">
          <h3 className="h3">Where the money went</h3>
          <div className="flow">
            {flow.map((f, i) => (
              <div key={f.k} className="flow-row">
                <span className="flow-k">
                  <Icon name={f.ic} size={15} /> {f.k}
                </span>
                <div className="flow-track">
                  <motion.i
                    className={f.tone}
                    initial={{ width: 0 }}
                    animate={{ width: `${(Math.abs(f.v) / maxFlow) * 100}%` }}
                    transition={{ delay: 0.15 + i * 0.07, duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
                  />
                </div>
                <b className={f.tone}>{inr(f.v)}</b>
              </div>
            ))}
            <div className={cx('flow-row total', profit ? 'pos' : 'neg')}>
              <span className="flow-k">Net result</span>
              <div />
              <b>{inr(s.net, true)}</b>
            </div>
          </div>
        </motion.section>

        {/* TREND */}
        <motion.section variants={rise} className="card pad">
          <div className="row between">
            <h3 className="h3">Last 7 days</h3>
            <span className="muted tiny">tap a bar</span>
          </div>
          <Chart points={trend} selected={date} onPick={setDate} />
        </motion.section>
      </div>

      {/* MOVING CARDS */}
      <motion.section variants={rise}>
        <div className="row between">
          <h3 className="h3">Payment watch</h3>
          <div className="row gap">
            <span className="muted tiny">
              Total outstanding <b className="neg">{inr(totalDue)}</b>
            </span>
            <button className="btn ghost sm" onClick={() => setPopup(true)}>
              <Icon name="bell" size={15} /> Alerts
            </button>
          </div>
        </div>
        {watch.length === 0 ? (
          <Empty icon="check" title="Everyone has paid" text="No outstanding dues right now." />
        ) : (
          <div className="marquee">
            <div className="marquee-track" style={{ animationDuration: `${Math.max(24, watch.length * 6)}s` }}>
              {[...watch, ...watch].map((d, i) => (
                <div key={i} className={cx('mcard', d.status)} onClick={() => setTab('cust')}>
                  <div className="row between">
                    <div className="avatar">{d.customer.name[0]}</div>
                    <StatusChip status={d.status} />
                  </div>
                  <b className="mname">{d.customer.name}</b>
                  <div className="mamt">{inr(d.outstanding)}</div>
                  <div className="track thin">
                    <i className={d.status === 'breach' ? 'neg' : d.status === 'warn' ? 'warn' : 'pos'} style={{ width: `${Math.min(100, d.usage * 100)}%` }} />
                  </div>
                  <small>
                    {d.limit ? `${Math.round(d.usage * 100)}% of ${inr(d.limit)}` : 'No limit set'} · {d.daysUnpaid}d old
                  </small>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.section>
    </motion.div>
  )
}
