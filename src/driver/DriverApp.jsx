import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useDriver } from './useDriver'
import { dpost, mapsTo } from './dapi'
import { fmtDate, inr, kgf, todayStr } from '../lib/util'
import { hasLL, mapsLinks } from '../lib/geo'

const P = {
  nav: '<path d="M12 3l8 18-8-4-8 4z"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  out: '<path d="M10 4H5v16h5M15 8l5 4-5 4M20 12H9"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/>',
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
  cash: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  phoneapp: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
  play: '<path d="M8 5l11 7-11 7z"/>',
  alert: '<path d="M12 3L2 20h20z"/><path d="M12 10v5M12 17.5v.5"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3M14 9l2 2"/>'
}
const Ic = ({ n, s = 22 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" dangerouslySetInnerHTML={{ __html: P[n] }} />
)

const isDone = (s) => s.track.status === 'delivered' || s.track.status === 'skipped'
const vibrate = (ms = 25) => {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* not supported */
  }
}
const greet = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

/* ------------------------------------------------------------------ login */
function Login({ onLogin }) {
  const [drivers, setDrivers] = useState(null)
  const [err, setErr] = useState('')
  const [pick, setPick] = useState(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(0)

  const load = async () => {
    setErr('')
    setDrivers(null)
    try {
      setDrivers(await dpost('driverList'))
    } catch (e) {
      setErr(/Wrong secret key|Unknown action/i.test(e.message) ? 'The office script is not updated yet. Ask the admin to paste the new Code.gs and deploy a New version.' : e.message)
      setDrivers([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  const press = (d) => {
    if (busy) return
    vibrate(10)
    if (d === 'x') return setPin((p) => p.slice(0, -1))
    setErr('')
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length === 4) submit(next)
  }
  const submit = async (code) => {
    setBusy(true)
    try {
      await onLogin(pick.id, code)
    } catch (e) {
      setErr(e.message)
      setPin('')
      setShake((n) => n + 1)
      vibrate(80)
    }
    setBusy(false)
  }

  return (
    <div className="d-login">
      <div className="d-glow" />
      <motion.div className="d-logo" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 14 }}>
        A
      </motion.div>
      <h1>Agenic Driver</h1>
      <p className="d-sub">{pick ? `Hi ${pick.name}, enter your PIN` : 'Who is driving today?'}</p>

      {!pick && (
        <div className="d-tiles">
          {drivers === null && <p className="d-muted">Loading drivers…</p>}
          {drivers?.length === 0 && !err && <p className="d-muted">No driver logins set up yet. Ask the admin to set your PIN.</p>}
          {drivers?.map((d, i) => (
            <motion.button key={d.id} className="d-tile" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }} onClick={() => setPick(d)}>
              <span className="d-av">{d.name[0]}</span>
              <b>{d.name}</b>
            </motion.button>
          ))}
          {err && (
            <div className="d-err">
              {err}
              <button className="d-link" onClick={load}>
                Try again
              </button>
            </div>
          )}
        </div>
      )}

      {pick && (
        <>
          <motion.div key={shake} className="d-dots" animate={shake ? { x: [0, -12, 12, -8, 8, 0] } : {}} transition={{ duration: 0.4 }}>
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={i < pin.length ? 'on' : ''} />
            ))}
          </motion.div>
          <div className="d-err-slot">{err}</div>
          <div className="d-pad">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
              <button key={k} onClick={() => press(k)} disabled={busy}>
                {k}
              </button>
            ))}
            <button className="ghost" onClick={() => (setPick(null), setPin(''), setErr(''))} aria-label="Back">
              Back
            </button>
            <button onClick={() => press('0')} disabled={busy}>
              0
            </button>
            <button className="ghost" onClick={() => press('x')} aria-label="Delete">
              ⌫
            </button>
          </div>
          {busy && <p className="d-muted">Checking…</p>}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ voice */
function useRecorder() {
  const [state, setState] = useState({ rec: false, secs: 0, url: '', data: '', mime: '', err: '' })
  const mr = useRef(null)
  const stream = useRef(null)
  const timer = useRef(null)
  const chunks = useRef([])
  const stopAll = () => {
    clearInterval(timer.current)
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }
  useEffect(() => stopAll, [])

  const start = async () => {
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('Voice recording is not supported on this phone browser.')
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true })
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported?.(t)) || ''
      const rec = new MediaRecorder(stream.current, type ? { mimeType: type, audioBitsPerSecond: 24000 } : undefined)
      chunks.current = []
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data)
      rec.onstop = () => {
        stopAll()
        const blob = new Blob(chunks.current, { type: rec.mimeType || type || 'audio/webm' })
        const fr = new FileReader()
        fr.onload = () => setState((s) => ({ ...s, rec: false, url: URL.createObjectURL(blob), data: String(fr.result).split(',')[1] || '', mime: blob.type }))
        fr.readAsDataURL(blob)
      }
      mr.current = rec
      rec.start(1000)
      setState({ rec: true, secs: 0, url: '', data: '', mime: '', err: '' })
      timer.current = setInterval(() => {
        setState((s) => {
          if (s.secs + 1 >= 90 && mr.current?.state === 'recording') mr.current.stop()
          return { ...s, secs: s.secs + 1 }
        })
      }, 1000)
    } catch (e) {
      stopAll()
      setState((s) => ({ ...s, rec: false, err: /denied|Permission|NotAllowed/i.test(String(e)) ? 'Microphone is blocked. Allow it in the browser settings.' : e.message }))
    }
  }
  const stop = () => mr.current?.state === 'recording' && mr.current.stop()
  const clear = () => setState({ rec: false, secs: 0, url: '', data: '', mime: '', err: '' })
  return { ...state, start, stop, clear }
}

/* ---------------------------------------------------------- collect sheet */
const QUICK = ['Hotel closed', 'Owner not available', 'Short quantity', 'Will pay tomorrow', 'Bill needed']

function CollectSheet({ stop, onClose, onSave, onSkip }) {
  const editing = isDone(stop)
  const total = editing ? stop.due.total + (stop.track.payAmount || 0) : stop.due.total
  const [mode, setMode] = useState(editing && stop.track.payMode ? stop.track.payMode : null)
  const [amount, setAmount] = useState(String(editing ? stop.track.payAmount : total))
  const [remark, setRemark] = useState(stop.track.remark || '')
  const [skipping, setSkipping] = useState(false)
  const voice = useRecorder()
  const amt = Number(amount) || 0
  const left = Math.max(0, total - (mode === 'pending' ? 0 : amt))
  const can = mode && (mode === 'pending' || amt > 0) && !voice.rec

  const pickMode = (m) => {
    vibrate(12)
    setMode(m)
    if (m === 'pending') setAmount('0')
    else if (!Number(amount)) setAmount(String(total))
  }
  const addQuick = (q) => setRemark((r) => (r ? (r.includes(q) ? r : `${r}. ${q}`) : q))
  const confirm = () => {
    vibrate(40)
    onSave({ payMode: mode, payAmount: mode === 'pending' ? 0 : amt, remark: remark.trim(), voice: voice.data ? { mime: voice.mime, data: voice.data } : null })
  }
  const skip = () => {
    if (remark.trim().length < 3) return
    vibrate(40)
    onSkip({ remark: remark.trim(), voice: voice.data ? { mime: voice.mime, data: voice.data } : null })
  }

  return (
    <motion.div className="d-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="d-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Delivery details">
        <div className="d-grab" />
        <div className="d-sheet-head">
          <div>
            <small>{skipping ? "Couldn't deliver" : editing ? 'Edit this stop' : 'Delivered - collect payment'}</small>
            <b>{stop.name}</b>
          </div>
          <button className="d-x" onClick={onClose} aria-label="Close">
            <Ic n="x" s={20} />
          </button>
        </div>

        <div className="d-scroll">
          {!skipping && (
            <>
              <div className="d-money">
                <div>
                  <small>To collect</small>
                  <b>{inr(total)}</b>
                </div>
                <div className="d-split">
                  <span>
                    Today <b>{inr(stop.due.today)}</b>
                  </span>
                  <span className={stop.due.previous > 0 ? 'bad' : ''}>
                    Previous pending <b>{inr(stop.due.previous)}</b>
                  </span>
                </div>
              </div>

              <div className="d-modes">
                <button className={mode === 'cash' ? 'on cash' : ''} onClick={() => pickMode('cash')}>
                  <Ic n="cash" s={26} />
                  <b>Cash</b>
                </button>
                <button className={mode === 'gpay' ? 'on gpay' : ''} onClick={() => pickMode('gpay')}>
                  <Ic n="phoneapp" s={26} />
                  <b>GPay</b>
                </button>
                <button className={mode === 'pending' ? 'on pend' : ''} onClick={() => pickMode('pending')}>
                  <Ic n="clock" s={26} />
                  <b>Pending</b>
                </button>
              </div>

              {mode && mode !== 'pending' && (
                <motion.label className="d-field" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
                  <span>Amount received (₹)</span>
                  <input type="number" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
                  {left > 0 && amt > 0 && <em>{inr(left)} will stay pending</em>}
                </motion.label>
              )}
              {mode === 'pending' && <p className="d-note">Nothing collected. {inr(total)} stays pending for this hotel.</p>}
            </>
          )}

          <label className="d-field">
            <span>{skipping ? 'Why not delivered? (required)' : 'Remark (optional)'}</span>
            <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Type a note for the office…" />
          </label>
          <div className="d-quick">
            {QUICK.map((q) => (
              <button key={q} onClick={() => addQuick(q)}>
                {q}
              </button>
            ))}
          </div>

          <div className="d-voice">
            {!voice.rec && !voice.url && (
              <button className="d-mic" onClick={voice.start}>
                <Ic n="mic" s={22} /> Record voice note
              </button>
            )}
            {voice.rec && (
              <button className="d-mic rec" onClick={voice.stop}>
                <i className="d-pulse" /> <Ic n="stop" s={20} /> Stop · {String(Math.floor(voice.secs / 60)).padStart(2, '0')}:{String(voice.secs % 60).padStart(2, '0')}
              </button>
            )}
            {voice.url && !voice.rec && (
              <div className="d-play">
                <audio controls src={voice.url} preload="metadata" />
                <button className="d-x" onClick={voice.clear} aria-label="Delete recording">
                  <Ic n="x" s={18} />
                </button>
              </div>
            )}
            {voice.err && <small className="d-errtxt">{voice.err}</small>}
            {stop.track.voiceId && !voice.url && <small className="d-note">A voice note is already saved for this stop.</small>}
          </div>
        </div>

        <div className="d-sheet-foot">
          {!skipping ? (
            <>
              <button className="d-btn go" disabled={!can} onClick={confirm}>
                <Ic n="check" s={22} /> {editing ? 'Save changes' : 'Confirm & next stop'}
              </button>
              {!editing && (
                <button className="d-btn ghost" onClick={() => setSkipping(true)}>
                  Couldn't deliver
                </button>
              )}
            </>
          ) : (
            <>
              <button className="d-btn warn" disabled={remark.trim().length < 3 || voice.rec} onClick={skip}>
                Mark not delivered & next
              </button>
              <button className="d-btn ghost" onClick={() => setSkipping(false)}>
                Back
              </button>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ cards */
function Ring({ done, total }) {
  const r = 30
  const c = 2 * Math.PI * r
  const pct = total ? done / total : 0
  return (
    <div className="d-ring">
      <svg width="76" height="76" viewBox="0 0 76 76">
        <circle cx="38" cy="38" r={r} className="bg" />
        <motion.circle cx="38" cy="38" r={r} className="fg" strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 0.8 }} />
      </svg>
      <span>
        <b>{done}</b>/{total}
      </span>
    </div>
  )
}

function Current({ stop, total, onDeliver, early }) {
  return (
    <motion.section key={stop.id} className="d-cur" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <div className="d-cur-top">
        <span className="d-seq">
          Stop {stop.seq} of {total}
          {early ? ' · unlocked' : ''}
        </span>
        <span className="d-kg">{kgf(stop.qty)}</span>
      </div>
      <h2>{stop.name}</h2>
      <p className="d-addr">{stop.address || stop.area || 'Address not saved'}</p>
      <div className="d-act2">
        <a className="d-btn nav" href={mapsTo(stop)} target="_blank" rel="noopener noreferrer">
          <Ic n="nav" s={20} /> Navigate
        </a>
        {stop.phone ? (
          <a className="d-btn call" href={`tel:${stop.phone}`}>
            <Ic n="phone" s={20} /> Call
          </a>
        ) : (
          <span className="d-btn call off">No phone</span>
        )}
      </div>
      <div className={'d-collect' + (stop.due.previous > 0 ? ' warn' : '')}>
        <div>
          <small>To collect</small>
          <b>{inr(stop.due.total)}</b>
        </div>
        <div className="d-parts">
          <span>
            Today <b>{inr(stop.due.today)}</b>
          </span>
          <span className={stop.due.previous > 0 ? 'bad' : ''}>
            {stop.due.previous > 0 && <Ic n="alert" s={13} />} Previous pending <b>{inr(stop.due.previous)}</b>
          </span>
        </div>
      </div>
      <button className="d-btn go big" onClick={onDeliver}>
        <Ic n="check" s={24} /> Delivered
      </button>
    </motion.section>
  )
}

function Row({ stop, locked, done, onEdit, onUnlock }) {
  const t = stop.track
  return (
    <motion.li layout className={'d-row' + (locked ? ' lock tap' : '') + (done ? ' done' : '')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={locked ? onUnlock : undefined}>
      <span className="d-n">{done ? <Ic n="check" s={16} /> : stop.seq}</span>
      <div className="d-row-main">
        <b>{stop.name}</b>
        <small>
          {kgf(stop.qty)}
          {done
            ? t.status === 'skipped'
              ? ' · Not delivered'
              : t.payMode === 'pending'
                ? ' · Pending'
                : ` · ${t.payMode === 'gpay' ? 'GPay' : 'Cash'} ${inr(t.payAmount)}`
            : ` · Collect ${inr(stop.due.total)}`}
        </small>
      </div>
      {t.voiceId || t.voicePending ? <Ic n="mic" s={16} /> : null}
      {done ? (
        <button className="d-edit" onClick={onEdit}>
          Edit
        </button>
      ) : (
        <span className="d-unl">
          <Ic n="lock" s={16} /> Unlock
        </span>
      )}
    </motion.li>
  )
}

/* ------------------------------------------------------------ unlock sheet */
function UnlockSheet({ target, office, onClose, onUnlock }) {
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async () => {
    setBusy(true)
    setErr('')
    try {
      await onUnlock(target.id, code)
      vibrate(40)
    } catch (e) {
      setErr(e.message)
      setCode('')
      vibrate(80)
    }
    setBusy(false)
  }
  return (
    <motion.div className="d-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="d-sheet" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Unlock">
        <div className="d-grab" />
        <div className="d-sheet-head">
          <div>
            <small>{target.id === 'return' ? 'Final point is locked' : 'Stop is locked'}</small>
            <b>{target.name}</b>
          </div>
          <button className="d-x" onClick={onClose} aria-label="Close">
            <Ic n="x" s={20} />
          </button>
        </div>
        <div className="d-scroll">
          <p className="d-note">
            {target.id === 'return' ? 'This opens after your last delivery.' : 'This stop opens after the one before it.'} To go out of order, call the office, tell them why, and type the 4-digit code they give you.
          </p>
          {office ? (
            <a className="d-btn nav" href={`tel:${office}`}>
              <Ic n="phone" s={20} /> Call office · {office}
            </a>
          ) : (
            <p className="d-errtxt">The office number is not set. Ask the admin to add it in Settings.</p>
          )}
          <label className="d-field">
            <span>Unlock code</span>
            <input type="tel" inputMode="numeric" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0000" autoComplete="one-time-code" />
          </label>
          {err && <p className="d-errtxt">{err}</p>}
        </div>
        <div className="d-sheet-foot">
          <button className="d-btn go" disabled={code.length !== 4 || busy} onClick={go}>
            <Ic n="key" s={22} /> {busy ? 'Checking…' : 'Unlock'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

/* ---------------------------------------------------------- route overview */
function Sketch({ depot, stops, state }) {
  const pts = []
  if (hasLL(depot)) pts.push({ lat: depot.lat, lng: depot.lng, s: true })
  stops.forEach((s, i) => hasLL({ lat: Number(s.lat), lng: Number(s.lng) }) && pts.push({ lat: Number(s.lat), lng: Number(s.lng), n: i + 1, st: state(s) }))
  if (pts.length < 2) return null
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length
  const kx = Math.cos((lat0 * Math.PI) / 180)
  const X = pts.map((p) => p.lng * kx)
  const Y = pts.map((p) => -p.lat)
  const [minX, maxX, minY, maxY] = [Math.min(...X), Math.max(...X), Math.min(...Y), Math.max(...Y)]
  const W = 340
  const H = 230
  const pad = 26
  const sc = Math.min((W - 2 * pad) / (maxX - minX || 1e-6), (H - 2 * pad) / (maxY - minY || 1e-6))
  const ox = pad + (W - 2 * pad - (maxX - minX) * sc) / 2
  const oy = pad + (H - 2 * pad - (maxY - minY) * sc) / 2
  const P = pts.map((p, i) => ({ ...p, x: ox + (X[i] - minX) * sc, y: oy + (Y[i] - minY) * sc }))
  const path = [...P, P[0]].map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const col = { done: '#1fd68f', now: '#ffb547', open: '#3d8bff', locked: '#6b7694' }
  return (
    <svg className="d-sketch" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Route sketch">
      <path d={path} fill="none" stroke="#7c5cff" strokeWidth="2" strokeDasharray="5 4" opacity=".8" />
      {P.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={p.s ? 11 : 10} fill={p.s ? '#1fd68f' : col[p.st] || '#6b7694'} stroke="#0b1226" strokeWidth="2" />
          <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize="11" fontWeight="800" fill="#06101f">
            {p.s ? 'S' : p.n}
          </text>
        </g>
      ))}
    </svg>
  )
}

function Overview({ route, stops, depot, office, stretch, unlockedReturn, cur, onClose, onUnlock }) {
  const [qrs, setQrs] = useState([])
  const links = useMemo(() => mapsLinks(hasLL(depot) ? depot : null, stops.map((s) => ({ ...s, lat: s.lat === '' || s.lat == null ? null : Number(s.lat), lng: s.lng === '' || s.lng == null ? null : Number(s.lng) }))), [stops, depot])
  useEffect(() => {
    let alive = true
    import('qrcode').then(async (QR) => {
      const imgs = []
      for (const l of links) imgs.push({ ...l, img: await QR.toDataURL(l.url, { margin: 1, width: 360, errorCorrectionLevel: 'L' }) })
      if (alive) setQrs(imgs)
    })
    return () => {
      alive = false
    }
  }, [links])
  const stateOf = (s) => (isDone(s) ? 'done' : cur && s.id === cur.id ? 'now' : s.track.unlocked ? 'open' : 'locked')
  const areas = [...new Set(stops.map((s) => s.area).filter(Boolean))]
  const label = { done: 'Done', now: 'Now', open: 'Unlocked', locked: 'Locked' }
  return (
    <motion.div className="d-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
      <motion.div className="d-sheet tall" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Today's route">
        <div className="d-grab" />
        <div className="d-sheet-head">
          <div>
            <small>Starts and ends at {depot?.name || 'pickup point'}</small>
            <b>Today's route</b>
          </div>
          <button className="d-x" onClick={onClose} aria-label="Close">
            <Ic n="x" s={20} />
          </button>
        </div>
        <div className="d-scroll">
          {(stretch || areas.length > 0) && (
            <div className="d-stretch">
              <small>Your stretch</small>
              <b>{stretch || areas.join(' › ')}</b>
              {stretch && areas.length > 0 && <span>{areas.join(' › ')}</span>}
            </div>
          )}
          <Sketch depot={depot} stops={stops} state={stateOf} />
          <ul className="d-ov">
            <li>
              <span className="d-n start">S</span>
              <div className="d-row-main">
                <b>{depot?.name || 'Pickup point'}</b>
                <small>Start</small>
              </div>
            </li>
            {stops.map((s) => {
              const st = stateOf(s)
              return (
                <li key={s.id} className={'st-' + st}>
                  <span className="d-n">{st === 'done' ? <Ic n="check" s={15} /> : s.seq}</span>
                  <div className="d-row-main">
                    <b>{s.name}</b>
                    <small>
                      {s.area || 'Area not set'} · {kgf(s.qty)}
                    </small>
                  </div>
                  <span className={'d-tag ' + st}>{label[st]}</span>
                  {st === 'locked' && (
                    <button className="d-edit" onClick={() => onUnlock({ id: s.id, name: s.name })}>
                      Unlock
                    </button>
                  )}
                </li>
              )
            })}
            <li className={'st-' + (unlockedReturn ? 'open' : 'locked')}>
              <span className="d-n start">
                <Ic n="home" s={15} />
              </span>
              <div className="d-row-main">
                <b>Return to {depot?.name || 'pickup point'}</b>
                <small>Final point</small>
              </div>
              {!unlockedReturn && (
                <button className="d-edit" onClick={() => onUnlock({ id: 'return', name: `Return to ${depot?.name || 'pickup point'}` })}>
                  Unlock
                </button>
              )}
            </li>
          </ul>

          {links.length > 0 && (
            <div className="d-qr">
              <h4>Whole route in Google Maps</h4>
              <p className="d-note">Tap to open, or scan the code with another phone. Each link covers up to 9 stops in order.</p>
              <div className="d-qr-grid">
                {links.map((l, i) => (
                  <div key={i} className="d-qr-item">
                    {qrs[i]?.img ? <img src={qrs[i].img} alt={`Route QR ${i + 1}`} /> : <div className="d-qr-ph" />}
                    <a className="d-btn nav" href={l.url} target="_blank" rel="noopener noreferrer">
                      <Ic n="nav" s={18} /> Stops {l.from}-{l.to}
                      {l.home ? ' + return' : ''}
                    </a>
                  </div>
                ))}
              </div>
            </div>
          )}
          {office && (
            <a className="d-btn call" href={`tel:${office}`}>
              <Ic n="phone" s={20} /> Call office · {office}
            </a>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

/* -------------------------------------------------------------------- app */
export default function DriverApp() {
  const dv = useDriver()
  const { session, route, stops, online, queueLen, error, setError, loading } = dv
  const [sheet, setSheet] = useState(null)
  const [unlockFor, setUnlockFor] = useState(null)
  const [overview, setOverview] = useState(false)
  const [toast, setToast] = useState('')
  const [showDone, setShowDone] = useState(false)
  const tt = useRef(null)
  const say = (m) => {
    setToast(m)
    clearTimeout(tt.current)
    tt.current = setTimeout(() => setToast(''), 2600)
  }
  useEffect(() => {
    if (error) {
      say(error)
      setError('')
    }
  }, [error]) // eslint-disable-line

  const cur = stops.find((s) => !isDone(s))
  const done = stops.filter(isDone)
  const open = stops.filter((s) => !isDone(s) && cur && (s.id === cur.id || s.track.unlocked))
  const upcoming = cur ? stops.filter((s) => !isDone(s) && !open.some((o) => o.id === s.id)) : []
  const office = route?.office?.phone || ''
  const stat = useMemo(() => {
    const left = stops.filter((s) => !isDone(s))
    const sum = (a, f) => a.reduce((x, s) => x + f(s), 0)
    return {
      kgLeft: sum(left, (s) => s.qty),
      collectLeft: sum(left, (s) => s.due.total),
      cash: sum(done.filter((s) => s.track.payMode === 'cash'), (s) => s.track.payAmount),
      gpay: sum(done.filter((s) => s.track.payMode === 'gpay'), (s) => s.track.payAmount),
      skipped: done.filter((s) => s.track.status === 'skipped').length
    }
  }, [stops]) // eslint-disable-line

  if (!session) return <Login onLogin={dv.login} />

  const depot = route?.depot
  const depotUrl = depot?.lat ? `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${depot.lat},${depot.lng}` : `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(depot?.name || 'Koratturr')}`

  const save = (stop, v) => {
    dv.act(stop.id, { status: 'delivered', payMode: v.payMode, payAmount: v.payAmount, remark: v.remark })
    if (v.voice) dv.sendVoice(stop.id, v.voice.mime, v.voice.data)
    setSheet(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    say(v.payMode === 'pending' ? 'Saved. Payment pending' : `Saved. ${v.payMode === 'gpay' ? 'GPay' : 'Cash'} ${inr(v.payAmount)} received`)
  }
  const skip = (stop, v) => {
    dv.act(stop.id, { status: 'skipped', remark: v.remark })
    if (v.voice) dv.sendVoice(stop.id, v.voice.mime, v.voice.data)
    setSheet(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    say('Marked not delivered')
  }

  return (
    <div className="dapp">
      <header className="d-head">
        <div>
          <small>{greet()}</small>
          <h1>{session.driver.name}</h1>
          <span className="d-date">{fmtDate(todayStr(), { weekday: 'long', day: 'numeric', month: 'short' })}</span>
        </div>
        <div className="d-head-r">
          <span className={'d-sync ' + (!online ? 'off' : queueLen ? 'wait' : 'ok')}>
            <i /> {!online ? 'Offline' : queueLen ? `Sending ${queueLen}…` : 'Live'}
          </span>
          <div className="d-icons">
            <button onClick={() => setOverview(true)} aria-label="Route overview" className="hl">
              <Ic n="map" s={20} />
            </button>
            {office && (
              <a href={`tel:${office}`} className="d-ib" aria-label="Call office">
                <Ic n="phone" s={20} />
              </a>
            )}
            <button onClick={dv.refresh} className={loading ? 'spin' : ''} aria-label="Refresh">
              <Ic n="refresh" s={20} />
            </button>
            <button onClick={() => confirm('Log out of the driver app?') && dv.logout()} aria-label="Log out">
              <Ic n="out" s={20} />
            </button>
          </div>
        </div>
      </header>

      {!online && <div className="d-banner">No internet. Keep going. Everything you do is saved and will send automatically.</div>}

      {!route && <p className="d-empty">Loading your route…</p>}

      {route && stops.length === 0 && (
        <div className="d-empty-card">
          <b>No deliveries assigned for today</b>
          <p>The office has not given you a route yet. Pull the refresh button above in a moment.</p>
        </div>
      )}

      {stops.length > 0 && (
        <>
          <section className="d-sum">
            <Ring done={done.length} total={stops.length} />
            <div className="d-sum-g">
              <div>
                <small>Left to deliver</small>
                <b>{kgf(stat.kgLeft)}</b>
              </div>
              <div>
                <small>Left to collect</small>
                <b>{inr(stat.collectLeft)}</b>
              </div>
              <div>
                <small>Cash</small>
                <b className="g">{inr(stat.cash)}</b>
              </div>
              <div>
                <small>GPay</small>
                <b className="g">{inr(stat.gpay)}</b>
              </div>
            </div>
          </section>

          {open.map((s) => (
            <Current key={s.id} stop={s} total={stops.length} early={s.id !== cur.id} onDeliver={() => setSheet(s.id)} />
          ))}

          {!cur && (
            <motion.section className="d-finish" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="d-tick">
                <Ic n="check" s={34} />
              </div>
              <h2>All stops done</h2>
              <p>
                Cash to hand over <b>{inr(stat.cash)}</b>
                <br />
                GPay received <b>{inr(stat.gpay)}</b>
                {stat.skipped > 0 && (
                  <>
                    <br />
                    Not delivered: <b>{stat.skipped}</b>
                  </>
                )}
              </p>
              <a className="d-btn nav big" href={depotUrl} target="_blank" rel="noopener noreferrer">
                <Ic n="home" s={22} /> Return to {depot?.name || 'pickup point'}
              </a>
            </motion.section>
          )}

          {upcoming.length > 0 && (
            <>
              <h3 className="d-h">Up next</h3>
              <ul className="d-list">
                {upcoming.map((s) => (
                  <Row key={s.id} stop={s} locked onUnlock={() => setUnlockFor({ id: s.id, name: s.name })} />
                ))}
              </ul>
              {dv.returnUnlocked ? (
                <a className="d-return" href={depotUrl} target="_blank" rel="noopener noreferrer">
                  <Ic n="home" s={18} /> Return to {depot?.name || 'pickup point'} · unlocked
                </a>
              ) : (
                <button className="d-return" onClick={() => setUnlockFor({ id: 'return', name: `Return to ${depot?.name || 'pickup point'}` })}>
                  <Ic n="lock" s={18} /> Last: return to {depot?.name || 'pickup point'} · Unlock
                </button>
              )}
            </>
          )}

          {done.length > 0 && (
            <>
              <button className="d-h" onClick={() => setShowDone((v) => !v)}>
                Done ({done.length}) <span>{showDone ? 'Hide' : 'Show'}</span>
              </button>
              {showDone && (
                <ul className="d-list">
                  {done.map((s) => (
                    <Row key={s.id} stop={s} done onEdit={() => setSheet(s.id)} />
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      <AnimatePresence>
        {sheet && stops.find((s) => s.id === sheet) && (
          <CollectSheet key={sheet} stop={stops.find((s) => s.id === sheet)} onClose={() => setSheet(null)} onSave={(v) => save(stops.find((s) => s.id === sheet), v)} onSkip={(v) => skip(stops.find((s) => s.id === sheet), v)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {overview && (
          <Overview key="ov" route={route} stops={stops} depot={depot} office={office} stretch={route?.stretch} unlockedReturn={dv.returnUnlocked || !cur} cur={cur} onClose={() => setOverview(false)} onUnlock={(t) => setUnlockFor(t)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {unlockFor && (
          <UnlockSheet
            key="unl"
            target={unlockFor}
            office={office}
            onClose={() => setUnlockFor(null)}
            onUnlock={async (id, code) => {
              await dv.unlock(id, code)
              setUnlockFor(null)
              say('Unlocked')
            }}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {toast && (
          <motion.div className="d-toast" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
