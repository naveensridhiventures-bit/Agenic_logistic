import { motion } from 'framer-motion'
import { SEGMENTS, SEG_ORDER } from '../lib/segments'
import { cx, inr, kgf } from '../lib/util'
import { Num, rise, Tilt } from './ui'

const EMOJI = { cash: '💵', weekly: '📅', occasional: '🕒', risk: '⚠️', new: '🌱' }

/** Animated cards: how customers pay, with 30-day kg and profit per group. Tap one to filter the list. */
export default function SegmentCards({ seg, active, onPick }) {
  const total = SEG_ORDER.reduce((s, k) => s + seg.groups[k].list.length, 0)
  return (
    <motion.section variants={rise} className="seg-wrap">
      <div className="row between wrap">
        <div>
          <h3 className="h3" style={{ marginBottom: 2 }}>How your customers pay</h3>
          <p className="muted">{total} customers · kg and profit are for the last 30 days · tap a card to see only that group</p>
        </div>
        {active && (
          <button className="btn ghost sm" onClick={() => onPick('')}>
            Show all customers
          </button>
        )}
      </div>
      <div className="seg-cards">
        {SEG_ORDER.map((k, i) => {
          const m = SEGMENTS[k]
          const g = seg.groups[k]
          return (
            <Tilt
              key={k}
              strength={4}
              variants={rise}
              className={cx('seg-card', 'seg-' + k, m.tone, active === k && 'on', k === 'risk' && g.list.length > 0 && 'alert')}
              style={{ '--hue': m.hue }}
              onClick={() => onPick(active === k ? '' : k)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onPick(active === k ? '' : k)}
            >
              {k === 'risk' && g.list.length > 0 && <i className="pulse-ring" />}
              <div className="seg-top">
                <span className="seg-emoji" aria-hidden="true">{EMOJI[k]}</span>
                <motion.b initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.15 + i * 0.07, type: 'spring', damping: 14 }} className="seg-count">
                  <Num value={g.list.length} format={(v) => String(Math.round(v))} duration={0.8} />
                </motion.b>
              </div>
              <h4>{m.label}</h4>
              <p>{m.blurb}</p>
              <div className="seg-stats">
                <span>
                  <small>Kg / 30 days</small>
                  <b><Num value={g.kg} format={(v) => kgf(Math.round(v))} duration={0.9} /></b>
                </span>
                <span>
                  <small>Profit</small>
                  <b className={g.profit < 0 ? 'neg' : 'pos'}><Num value={g.profit} format={(v) => inr(v)} duration={0.9} /></b>
                </span>
                <span>
                  <small>Pending</small>
                  <b className={g.outstanding > 0 ? 'neg' : ''}><Num value={g.outstanding} duration={0.9} /></b>
                </span>
              </div>
              <div className="seg-bar" title="Share of your total profit">
                <motion.i initial={{ width: 0 }} animate={{ width: `${Math.round(g.share * 100)}%` }} transition={{ duration: 1.1, delay: 0.2 + i * 0.07, ease: [0.2, 0.8, 0.2, 1] }} />
              </div>
              <small className="muted">{Math.round(g.share * 100)}% of profit</small>
            </Tilt>
          )
        })}
      </div>
    </motion.section>
  )
}
