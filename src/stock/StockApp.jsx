import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { getCfg } from '../lib/api'
import { dpost } from '../driver/dapi'
import { addDays, cx, fmtDate, todayStr } from '../lib/util'
import { ageOf, dayStock, packetText, stockId, stockSummaryRange, suggestProduction } from '../lib/stock'

const SES = 'agenic.stock.session'
const CACHE = 'agenic.stock.data'
const QUEUE = 'agenic.stock.queue'
const rd = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null') ?? d
  } catch {
    return d
  }
}
const wr = (k, v) => {
  try {
    v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}
const kgt = (n) => `${Math.round((Number(n) || 0) * 100) / 100} kg`
const vib = (ms = 20) => {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* ignore */
  }
}
const norm = (d) => ({
  today: d.today || todayStr(),
  company: d.company || 'Agenic',
  products: (d.products || []).map((p) => ({ ...p, id: String(p.id), packetKg: Number(p.packetKg) || 0, buffer: p.buffer === '' || p.buffer == null ? 5 : Number(p.buffer), shelfDays: Number(p.shelfDays) || 0, main: p.main === true || String(p.main).toLowerCase() === 'true' })),
  stock: (d.stock || []).map((s) => ({ ...s, id: String(s.id), date: String(s.date), productId: String(s.productId), kg: Number(s.kg) || 0 })),
  deliveries: (d.deliveries || []).map((x) => ({ date: String(x.date), qty: Number(x.qty) || 0 }))
})

function useStock() {
  const [session, setSession] = useState(() => rd(SES, null))
  const [data, setData] = useState(() => (rd(CACHE, null) ? norm(rd(CACHE, null)) : null))
  const [online, setOnline] = useState(navigator.onLine)
  const [qlen, setQlen] = useState(() => rd(QUEUE, []).length)
  const [error, setError] = useState('')
  const q = useRef(rd(QUEUE, []))
  const busy = useRef(false)
  const tok = useRef(session?.token)
  tok.current = session?.token

  const applyQ = (d) => {
    let stock = d.stock
    for (const r of q.current) {
      const id = stockId(r.date, r.productId, r.type)
      stock = stock.filter((s) => s.id !== id)
      if (r.kg > 0) stock = [...stock, { id, date: r.date, productId: r.productId, type: r.type, kg: r.kg, note: r.note || '', by: 'Stock in-charge', updatedAt: new Date().toISOString() }]
    }
    return { ...d, stock }
  }
  const logout = useCallback(() => {
    wr(SES, null)
    wr(CACHE, null)
    wr(QUEUE, null)
    q.current = []
    setQlen(0)
    setSession(null)
    setData(null)
  }, [])
  const handle = (e) => {
    if (/Session expired|not set up/i.test(e.message)) logout()
    if (e.net) setOnline(false)
    else setError(e.message)
  }
  const refresh = useCallback(async () => {
    if (!tok.current || busy.current) return
    try {
      const d = norm(await dpost('stockData', { token: tok.current }))
      wr(CACHE, d)
      setData(applyQ(d))
      setOnline(true)
    } catch (e) {
      handle(e)
    }
  }, []) // eslint-disable-line
  const flush = useCallback(async () => {
    if (busy.current || !q.current.length || !tok.current) return
    busy.current = true
    const sending = q.current.length
    try {
      const d = norm(await dpost('stockSave', { token: tok.current, rows: q.current.slice(0, sending) }))
      q.current = q.current.slice(sending)
      wr(QUEUE, q.current)
      setQlen(q.current.length)
      wr(CACHE, d)
      setData(applyQ(d))
      setOnline(true)
    } catch (e) {
      handle(e)
    }
    busy.current = false
    if (q.current.length && navigator.onLine) setTimeout(flush, 4000)
  }, []) // eslint-disable-line
  const save = (rows) => {
    q.current = [...q.current, ...rows]
    wr(QUEUE, q.current)
    setQlen(q.current.length)
    setData((d) => applyQ({ ...d, stock: d.stock }))
    flush()
  }
  const login = async (pin) => {
    const r = await dpost('stockLogin', { pin })
    const s = { token: r.token, name: r.name }
    wr(SES, s)
    tok.current = s.token
    setSession(s)
    await refresh()
  }
  useEffect(() => {
    if (!session) return
    refresh()
    flush()
    const t = setInterval(() => (q.current.length ? flush() : refresh()), 30000)
    const on = () => (setOnline(true), flush(), refresh())
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      clearInterval(t)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [session?.token]) // eslint-disable-line
  return { session, data, online, qlen, error, setError, login, logout, save, refresh }
}

function Login({ onLogin }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [shake, setShake] = useState(0)
  const press = async (d) => {
    if (busy) return
    vib(10)
    if (d === 'x') return setPin((p) => p.slice(0, -1))
    setErr('')
    const next = (pin + d).slice(0, 4)
    setPin(next)
    if (next.length < 4) return
    setBusy(true)
    try {
      await onLogin(next)
    } catch (e) {
      setErr(/Wrong secret key|Unknown action/i.test(e.message) ? 'The office script is not updated yet. Ask the admin to deploy the new Code.gs.' : e.message)
      setPin('')
      setShake((n) => n + 1)
      vib(80)
    }
    setBusy(false)
  }
  return (
    <div className="d-login">
      <div className="d-glow" />
      <motion.div className="d-logo" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', damping: 14 }}>
        A
      </motion.div>
      <h1>Agenic Stock</h1>
      <p className="d-sub">Stock in-charge · enter your PIN</p>
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
        <span />
        <button onClick={() => press('0')} disabled={busy}>
          0
        </button>
        <button className="ghost" onClick={() => press('x')} aria-label="Delete">
          ⌫
        </button>
      </div>
      {busy && <p className="d-muted">Checking…</p>}
    </div>
  )
}

export default function StockApp() {
  const st = useStock()
  const { session, data } = st
  if (!getCfg().url) return <div className="d-login"><p className="d-sub">App is not connected to the office sheet yet.</p></div>
  if (!session) return <Login onLogin={st.login} />
  if (!data) return <div className="d-login"><div className="d-glow" /><p className="d-sub" style={{ marginTop: 120 }}>Loading stock…</p>{st.error && <div className="d-err">{st.error}</div>}</div>
  return <Home st={st} />
}

function Home({ st }) {
  const { data, online, qlen } = st
  const today = data.today
  const [date, setDate] = useState(today)
  const products = data.products
  const [pid, setPid] = useState('')
  const product = products.find((p) => p.id === pid) || products[0]
  const [unit, setUnit] = useState('kg')
  const [f, setF] = useState({ produce: '', dispatch: '', waste: '', note: '' })
  const [toast, setToast] = useState('')
  const tt = useRef(null)
  const say = (m) => {
    setToast(m)
    clearTimeout(tt.current)
    tt.current = setTimeout(() => setToast(''), 2600)
  }
  useEffect(() => {
    if (st.error) {
      say(st.error)
      st.setError('')
    }
  }, [st.error]) // eslint-disable-line
  useEffect(() => {
    if (!product) return
    const g = (t) => data.stock.find((s) => s.id === stockId(date, product.id, t))
    setUnit('kg')
    setF({ produce: g('produce')?.kg || '', dispatch: g('dispatch')?.kg || '', waste: g('waste')?.kg || '', note: g('produce')?.note || g('dispatch')?.note || '' })
  }, [date, product?.id]) // eslint-disable-line

  const pk = Number(product?.packetKg) || 0
  const toKg = (v) => (unit === 'pk' && pk ? (Number(v) || 0) * pk : Number(v) || 0)
  const vals = { produce: toKg(f.produce), dispatch: toKg(f.dispatch), waste: toKg(f.waste) }
  const switchUnit = (u) => {
    if (u === unit || !pk) return
    const conv = (v) => (v === '' ? '' : String(Math.round((u === 'pk' ? Number(v) / pk : Number(v) * pk) * 100) / 100))
    setF((x) => ({ ...x, produce: conv(x.produce), dispatch: conv(x.dispatch), waste: conv(x.waste) }))
    setUnit(u)
  }
  const withMine = useMemo(() => {
    if (!product) return data
    const others = data.stock.filter((s) => !(s.date === date && s.productId === product.id))
    const mine = Object.entries(vals).filter(([, v]) => v > 0).map(([type, kg]) => ({ id: stockId(date, product.id, type), date, productId: product.id, type, kg, note: '' }))
    return { ...data, stock: [...others, ...mine] }
  }, [data, date, product, f, unit]) // eslint-disable-line
  const saved = useMemo(() => (product ? dayStock(product, date, data) : null), [data, date, product])
  const prev = useMemo(() => (product ? dayStock(product, date, { ...data, stock: data.stock.filter((s) => !(s.date === date && s.productId === product.id)) }) : null), [data, date, product])
  const live = useMemo(() => (product ? dayStock(product, date, withMine) : null), [withMine, date, product])
  const sug = useMemo(() => (product ? suggestProduction(product, addDays(date, 1), withMine) : null), [withMine, date, product])
  const week = useMemo(() => (product ? stockSummaryRange(product, addDays(today, -6), today, data) : []), [data, product, today])
  const minD = addDays(today, -7)
  const maxD = addDays(today, 1)
  const dirty = ['produce', 'dispatch', 'waste'].some((t) => Math.round(vals[t] * 1000) !== Math.round((data.stock.find((s) => s.id === stockId(date, product?.id, t))?.kg || 0) * 1000))

  const save = () => {
    const rows = ['produce', 'dispatch', 'waste'].map((t) => ({ date, productId: product.id, type: t, kg: Math.round(vals[t] * 1000) / 1000, note: f.note }))
    vib(30)
    st.save(rows)
    say('Saved ✓ The office can see it now')
  }

  if (!product)
    return (
      <div className="dapp">
        <Header st={st} />
        <p className="d-muted" style={{ marginTop: 60 }}>No products yet. Ask the admin to add products in the Stock tab.</p>
      </div>
    )
  const lbl = date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : date === addDays(today, -1) ? 'Yesterday' : fmtDate(date, { weekday: 'short', day: 'numeric', month: 'short' })
  return (
    <div className="dapp sk">
      <Header st={st} />
      <div className="sk-date">
        <button disabled={date <= minD} onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">‹</button>
        <div>
          <b>{lbl}</b>
          <small>{fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}</small>
        </div>
        <button disabled={date >= maxD} onClick={() => setDate(addDays(date, 1))} aria-label="Next day">›</button>
      </div>
      <div className="sk-prods">
        {products.map((p) => (
          <button key={p.id} className={cx(p.id === product.id && 'on')} onClick={() => setPid(p.id)}>
            {p.name}
          </button>
        ))}
      </div>

      <div className="sk-hero">
        <small>In hand at end of {lbl.toLowerCase()}</small>
        <b>{kgt(saved.closing)}</b>
        <span>{packetText(saved.closing, product) || ' '}</span>
      </div>
      <div className="sk-tiles">
        <div><small>Carried in</small><b>{kgt(prev.closing)}</b></div>
        <div className="pos"><small>Made</small><b>{kgt(saved.produced)}</b></div>
        <div><small>Sent out</small><b>{kgt(saved.dispatched)}</b></div>
        <div className={saved.waste ? 'neg' : ''}><small>Wasted</small><b>{kgt(saved.waste)}</b></div>
      </div>

      {prev.closingBatches.length > 0 && (
        <div className="sk-card warn">
          <h3>⚠ Clear this old stock first</h3>
          <div className="sk-batches">
            {prev.closingBatches.map((b) => {
              const age = ageOf(b.date, date)
              const old = product.shelfDays && age >= product.shelfDays
              return (
                <div key={b.date} className={cx('sk-batch', old && 'old')}>
                  <small>Made {fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' })}</small>
                  <b>{kgt(b.kg)}</b>
                  <span>{packetText(b.kg, product)}</span>
                  <em>{age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} old`}{old ? ' · past shelf life' : ''}</em>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="sk-card">
        <div className="sk-row">
          <h3>Update stock</h3>
          {pk > 0 && (
            <div className="sk-seg">
              <button className={cx(unit === 'kg' && 'on')} onClick={() => switchUnit('kg')}>Kg</button>
              <button className={cx(unit === 'pk' && 'on')} onClick={() => switchUnit('pk')}>Packets</button>
            </div>
          )}
        </div>
        {[['produce', 'Made today', 'New batch produced'], ['dispatch', 'Sent out', 'Went for delivery / sold'], ['waste', 'Wasted', 'Spoiled or discarded']].map(([k, t, h]) => (
          <label key={k} className="sk-field">
            <span>{t} <small>({unit === 'pk' ? 'packets' : 'kg'})</small></span>
            <input type="number" inputMode="decimal" min="0" step="any" value={f[k]} placeholder="0" onChange={(e) => setF({ ...f, [k]: e.target.value })} />
            <em>{vals[k] > 0 && pk ? `${kgt(vals[k])} = ${packetText(vals[k], product)}` : h}</em>
          </label>
        ))}
        <label className="sk-field">
          <span>Note <small>(optional)</small></span>
          <input value={f.note} placeholder="e.g. 2 hotels cancelled" onChange={(e) => setF({ ...f, note: e.target.value })} />
        </label>
        <div className={cx('sk-sum', live.short > 0 && 'neg')}>
          <span>{kgt(live.opening)} + {kgt(live.produced)} − {kgt(live.dispatched)} − {kgt(live.waste)}</span>
          <b>= {kgt(live.closing)} left{packetText(live.closing, product) ? ` · ${packetText(live.closing, product)}` : ''}</b>
        </div>
        {live.short > 0 && <p className="sk-warn">Sent + wasted is {kgt(live.short)} more than the stock available. Check the made quantity.</p>}
        <button className="sk-save" disabled={!dirty} onClick={save}>{dirty ? 'Save stock' : 'Saved'}</button>
      </div>

      <div className="sk-card sug">
        <h3>Make how much for {fmtDate(addDays(date, 1), { weekday: 'long' })}?</h3>
        <div className="sk-big"><b>{kgt(sug.make)}</b><span>{packetText(sug.make, product)}</span></div>
        <p>
          {sug.source === 'none'
            ? 'Enter a few days of "Sent out" and I will suggest the quantity.'
            : sug.make === 0
              ? 'Enough stock already. No need to make more – avoids wastage.'
              : `Need about ${kgt(sug.demand)}${sug.buffer ? ` + ${sug.buffer}% safety` : ''}, minus ${kgt(sug.carry)} in hand.`}
        </p>
        {sug.expired > 0 && <p className="sk-warn">{kgt(sug.expired)} will be past shelf life. Do not count on it.</p>}
      </div>

      <div className="sk-card">
        <h3>Last 7 days</h3>
        {!week.length && <p className="d-muted">Nothing yet.</p>}
        {week.map((d) => (
          <button key={d.date} className="sk-day" onClick={() => setDate(d.date)}>
            <b>{fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</b>
            <span>Made {kgt(d.produced)} · Sent {kgt(d.dispatched)}{d.waste ? ` · Waste ${kgt(d.waste)}` : ''}</span>
            <em>Left {kgt(d.closing)}</em>
          </button>
        ))}
      </div>
      <AnimatePresence>{toast && <motion.div className="d-toast" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}>{toast}</motion.div>}</AnimatePresence>
    </div>
  )
}

function Header({ st }) {
  return (
    <div className="d-head">
      <div>
        <small>{st.data?.company || 'Agenic'}</small>
        <h1>Stock in-charge</h1>
      </div>
      <div className="d-head-r">
        <span className={cx('d-sync', (!st.online || st.qlen > 0) && 'off')}>{!st.online ? 'Offline' : st.qlen ? `Sending ${st.qlen}…` : 'Synced'}</span>
        <button className="d-link" onClick={() => confirm('Log out?') && st.logout()}>Log out</button>
      </div>
    </div>
  )
}
