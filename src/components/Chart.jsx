import { useState } from 'react'
import { motion } from 'framer-motion'
import { fmtDate, inr } from '../lib/util'

/** Animated profit/loss bars. Green above the line, red below. Tap a bar to open that day. */
export default function Chart({ points, selected, onPick }) {
  const [hover, setHover] = useState(null)
  const W = 100
  const H = 56
  const max = Math.max(1, ...points.map((p) => Math.abs(p.net)))
  const hasNeg = points.some((p) => p.net < 0)
  const base = hasNeg ? H * 0.62 : H * 0.88
  const up = base - 6
  const down = H - base - 6
  const bw = W / points.length
  const active = hover ?? points.findIndex((p) => p.date === selected)

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Net profit and loss by day">
        <line x1="0" x2={W} y1={base} y2={base} className="axis" />
        {points.map((p, i) => {
          const pos = p.net >= 0
          const h = p.empty ? 0.6 : Math.max(1.2, (Math.abs(p.net) / max) * (pos ? up : down))
          const x = i * bw + bw * 0.2
          return (
            <motion.rect
              key={p.date}
              x={x}
              y={pos ? base - h : base}
              width={bw * 0.6}
              height={h}
              rx="1.2"
              className={`bar ${pos ? 'pos' : 'neg'} ${active === i ? 'on' : ''} ${p.empty ? 'none' : ''}`}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ delay: i * 0.06, type: 'spring', damping: 14, stiffness: 120 }}
              style={{ transformBox: 'fill-box', transformOrigin: pos ? 'bottom' : 'top', cursor: 'pointer' }}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick?.(p.date)}
            />
          )
        })}
      </svg>
      <div className="chart-x">
        {points.map((p, i) => (
          <button key={p.date} className={active === i ? 'on' : ''} onClick={() => onPick?.(p.date)}>
            {fmtDate(p.date, { weekday: 'short' }).slice(0, 3)}
            <small>{fmtDate(p.date, { day: 'numeric' })}</small>
          </button>
        ))}
      </div>
      {active >= 0 && points[active] && (
        <motion.div
          key={active}
          className={`chart-tip ${points[active].net >= 0 ? 'pos' : 'neg'}`}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {fmtDate(points[active].date, { day: 'numeric', month: 'short' })}:{' '}
          <b>{points[active].empty ? 'no entries' : inr(points[active].net, true)}</b>
        </motion.div>
      )}
    </div>
  )
}
