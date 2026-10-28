import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import * as api from '../lib/api'
import { routesForDate } from '../lib/routing'
import { dayLog } from '../lib/deliveryLog'
import { unlockCode, stopKey, returnKey } from '../lib/unlock'
import { cx, inr, kgf, todayStr } from '../lib/util'
import { Empty, Icon, rise, stagger } from './ui'

const hhmm = (iso) => (iso && iso.length >= 16 ? iso.slice(11, 16) : '')

function Voice({ fileId }) {
  const [st, setSt] = useState({ s: 'idle', url: '', err: '' })
  const load = async () => {
    setSt({ s: 'loading', url: '', err: '' })
    try {
      const r = await api.post({ action: 'getVoice', fileId })
      const bin = atob(r.data.data)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      setSt({ s: 'ready', url: URL.createObjectURL(new Blob([bytes], { type: r.data.mime })), err: '' })
    } catch (e) {
      setSt({ s: 'error', url: '', err: e.message })
    }
  }
  if (st.s === 'ready') return <audio controls autoPlay src={st.url} className="live-audio" />
  return (
    <button type="button" className="btn ghost sm" onClick={load} disabled={st.s === 'loading'}>
      <Icon name="bell" size={14} /> {st.s === 'loading' ? 'Loading…' : st.s === 'error' ? 'Retry voice note' : 'Play voice note'}
    </button>
  )
}

/** Reveal the 4-digit code the admin reads out when a driver calls to open a locked stop. */
function UnlockCode({ k, label = 'Unlock code' }) {
  const [code, setCode] = useState('')
  if (code)
    return (
      <span className="chip warn live-code" title="Read this to the driver over the phone">
        {label}: <b>{code}</b>
      </span>
    )
  return (
    <button type="button" className="btn ghost sm" onClick={async () => setCode(await unlockCode(k))}>
      <Icon name="bell" size={14} /> {label}
    </button>
  )
}

/** What the drivers are doing right now: delivered or not, money collected, remarks and voice notes. */
export default function LiveBoard() {
  const { data, date, pull } = useApp()
  const { drivers, routes } = useMemo(() => routesForDate(date, data), [data, date])
  const L = useMemo(() => dayLog(date, data), [data, date])
  const trk = useMemo(() => new Map((data.tracking || []).map((t) => [t.id, t])), [data.tracking])

  useEffect(() => {
    const id = setInterval(() => document.visibilityState === 'visible' && pull(), 15000)
    return () => clearInterval(id)
  }, [pull])

  const active = drivers.filter((d) => routes[d.id].length)
  if (!active.length) return <Empty icon="truck" title="No routes to follow" text="Assign orders to drivers on the Plan tab. Their live progress shows here once they log in." />

  const stats = [
    ['Total', L.orders, ''],
    ['Done', L.done, 'pos'],
    ['Kg', `${Math.round(L.kg * 10) / 10}kg`, ''],
    ['Bill', inr(L.bill), ''],
    ['Collected', inr(L.collected), 'pos'],
    ['Pending', inr(L.pending), L.pending > 0 ? 'neg' : '']
  ]
  return (
    <motion.div className="live-wrap" variants={stagger} initial="hidden" animate="show">
    <motion.div variants={rise} className="live-stats">
      {stats.map(([k, v, tone]) => (
        <div key={k} className={cx('live-stat', tone)}>
          <small>{k}</small>
          <b>{v}</b>
        </div>
      ))}
    </motion.div>
    <motion.div className="live-grid" variants={stagger} initial="hidden" animate="show">
      {active.map((d) => {
        const stops = routes[d.id].map((s) => ({ ...s, t: trk.get(s.id) || {} }))
        const done = stops.filter((s) => s.t.status === 'delivered' || s.t.status === 'skipped')
        const cash = stops.filter((s) => s.t.payMode === 'cash').reduce((a, s) => a + (Number(s.t.payAmount) || 0), 0)
        const gpay = stops.filter((s) => s.t.payMode === 'gpay').reduce((a, s) => a + (Number(s.t.payAmount) || 0), 0)
        const pend = stops.filter((s) => s.t.status === 'delivered' && s.t.payMode === 'pending').length
        const nextIdx = stops.findIndex((s) => !(s.t.status === 'delivered' || s.t.status === 'skipped'))
        const pct = stops.length ? (done.length / stops.length) * 100 : 0
        return (
          <motion.section key={d.id} variants={rise} className="card pad live-card">
            <div className="lane-head">
              <div className="avatar">{d.name[0]}</div>
              <div className="li-main">
                <b>{d.name}</b>
                <small>
                  {done.length} of {stops.length} done{nextIdx >= 0 ? ` · now at stop ${nextIdx + 1}: ${stops[nextIdx].name}` : ' · route complete'}
                </small>
              </div>
              <span className={cx('chip', done.length === stops.length ? 'clear' : 'warn')}>{done.length === stops.length ? 'Finished' : 'On route'}</span>
            </div>
            <div className="track">
              <motion.i className="pos" animate={{ width: `${pct}%` }} transition={{ duration: 0.7 }} />
            </div>
            <div className="metrics">
              <span>
                Cash <b>{inr(cash)}</b>
              </span>
              <span>
                GPay <b>{inr(gpay)}</b>
              </span>
              <span className={pend ? 'neg' : ''}>
                Pending <b>{pend}</b> hotel{pend === 1 ? '' : 's'}
              </span>
            </div>
            <ul className="live-list">
              {stops.map((s, i) => {
                const st = s.t.status
                const finished = st === 'delivered' || st === 'skipped'
                return (
                  <li key={s.id} className={cx('live-row', finished && 'done', i === nextIdx && 'now')}>
                    <span className={cx('seq', st === 'skipped' && 'bad')}>{finished && st === 'delivered' ? <Icon name="check" size={14} /> : i + 1}</span>
                    <div className="live-main">
                      <div className="row between wrap">
                        <b>{s.name}</b>
                        <small className="muted">
                          {kgf(s.kg)}
                          {s.t.doneAt ? ` · ${hhmm(s.t.doneAt)}` : ''}
                        </small>
                      </div>
                      <div className="live-chips">
                        {!finished && <span className={cx('chip', i === nextIdx ? 'warn' : 'info')}>{i === nextIdx ? 'Next / on the way' : 'Waiting'}</span>}
                        {st === 'delivered' && <span className="chip clear">Delivered</span>}
                        {st === 'skipped' && <span className="chip bad">Not delivered</span>}
                        {s.t.payMode === 'cash' && <span className="chip clear">Cash {inr(s.t.payAmount)}</span>}
                        {s.t.payMode === 'gpay' && <span className="chip clear">GPay {inr(s.t.payAmount)}</span>}
                        {s.t.payMode === 'pending' && <span className="chip bad">Payment pending</span>}
                        {s.t.unlocked === 'yes' && <span className="chip info">Unlocked early</span>}
                      </div>
                      {s.t.remark && <p className="live-remark">“{s.t.remark}”</p>}
                      {s.t.voiceId && <Voice fileId={s.t.voiceId} />}
                      {!finished && i !== nextIdx && s.t.unlocked !== 'yes' && <UnlockCode k={stopKey(s.id)} />}
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="row between wrap live-ret">
              <small className="muted">Driver wants to return to the pickup point early?</small>
              <UnlockCode k={returnKey(d.id, todayStr())} label="Return code" />
            </div>
          </motion.section>
        )
      })}
    </motion.div>
    </motion.div>
  )
}
