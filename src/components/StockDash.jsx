import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import { dayStock, packetText, stockSummaryRange } from '../lib/stock'
import { addDays, cx, fmtDate, sum, todayStr } from '../lib/util'
import { Icon, rise } from './ui'

const kgt = (n) => `${Math.round((Number(n) || 0) * 100) / 100} kg`
const ago = (iso) => {
  if (!iso) return ''
  const t = new Date(String(iso).length <= 19 && !String(iso).endsWith('Z') ? iso : iso)
  const m = Math.round((Date.now() - t.getTime()) / 60000)
  if (isNaN(m)) return ''
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  return fmtDate(String(iso).slice(0, 10), { day: 'numeric', month: 'short' })
}

/** Link + PIN for the stock in-charge's own login. */
export function StockLoginCard() {
  const { data, saveSettings, toast } = useApp()
  const link = `${location.origin}/?stock=1`
  const cur = String(data.settings.stockPin || '')
  const [pin, setPin] = useState(cur)
  const [qr, setQr] = useState('')
  const [showQr, setShowQr] = useState(false)
  useEffect(() => setPin(String(data.settings.stockPin || '')), [data.settings.stockPin])
  useEffect(() => {
    if (!showQr || qr) return
    import('qrcode').then((Q) => Q.toDataURL(link, { margin: 1, width: 300 }).then(setQr))
  }, [showQr]) // eslint-disable-line
  const save = () => {
    if (!/^\d{4}$/.test(pin)) return toast('PIN must be 4 digits', 'warn')
    saveSettings({ stockPin: pin })
    toast('Stock in-charge PIN saved')
  }
  const copy = () => navigator.clipboard?.writeText(link).then(() => toast('Link copied'), () => toast(link))
  const wa = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Agenic stock app: ${link}\nPIN: ${cur}\nOpen on your phone, enter the PIN, then tap Add to Home screen.`)}`, '_blank', 'noopener')
  return (
    <motion.div variants={rise} className="dlink stk-login">
      <div className="dlink-ic"><Icon name="box" size={22} /></div>
      <div className="dlink-main">
        <small>Stock in-charge login · separate from the admin app</small>
        <a href={link} target="_blank" rel="noopener noreferrer">{link.replace(/^https?:\/\//, '')}</a>
      </div>
      <div className="dlink-actions">
        <input className="pin-in" inputMode="numeric" maxLength={4} value={pin} placeholder="PIN" onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        <button type="button" className="btn ghost sm" onClick={() => setPin(String(1000 + Math.floor(Math.random() * 9000)))}>New</button>
        <button type="button" className="btn primary sm" disabled={pin === cur} onClick={save}>Save PIN</button>
        <button type="button" className="btn ghost sm" onClick={copy}>Copy</button>
        <button type="button" className="btn ghost sm" disabled={!cur} onClick={wa}>WhatsApp</button>
        <button type="button" className="btn ghost sm" onClick={() => setShowQr((v) => !v)}>{showQr ? 'Hide QR' : 'QR'}</button>
      </div>
      {!cur && <p className="stk-hint">Set a 4-digit PIN to switch the in-charge login on.</p>}
      {showQr && (
        <motion.div className="dlink-qr" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          {qr ? <img src={qr} alt="Stock app QR" /> : <span className="muted">Making QR…</span>}
          <small>Scan with the phone camera</small>
        </motion.div>
      )}
    </motion.div>
  )
}

/** Simple dashboard: today's position per product, 7-day made vs sent, wastage and who updated when. */
export function StockDashboard({ onPick }) {
  const { data } = useApp()
  const today = todayStr()
  const products = data.products.filter((p) => p.active !== false)
  const cards = useMemo(
    () =>
      products.map((p) => {
        const d = dayStock(p, today, data)
        const week = stockSummaryRange(p, addDays(today, -6), today, data).reverse()
        const range = stockSummaryRange(p, addDays(today, -13), today, data)
        const made = sum(range, (r) => r.produced)
        const waste = sum(range, (r) => r.waste)
        const rows = data.stock.filter((s) => s.productId === p.id && s.date === today && s.updatedAt).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
        const last = rows[0]
        const days = [...Array(7)].map((_, i) => {
          const dt = addDays(today, i - 6)
          const r = week.find((x) => x.date === dt)
          return { dt, made: r?.produced || 0, sent: r?.dispatched || 0 }
        })
        return { p, d, days, wastePct: made ? (waste / made) * 100 : 0, made14: made, last }
      }),
    [data, today] // eslint-disable-line
  )
  const tot = (k) => sum(cards, (c) => c.d[k])
  if (!products.length) return null
  const tiles = [
    ['In hand now', kgt(tot('closing')), 'brand'],
    ['Made today', kgt(tot('produced')), 'pos'],
    ['Sent today', kgt(tot('dispatched')), ''],
    ['Wasted today', kgt(tot('waste')), tot('waste') ? 'neg' : '']
  ]
  return (
    <motion.section variants={rise} className="stk-dash">
      <div className="stk-tiles">
        {tiles.map(([k, v, tone]) => (
          <div key={k} className={cx('stk-tile', tone)}>
            <small>{k}</small>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="stk-cards">
        {cards.map(({ p, d, days, wastePct, made14, last }) => {
          const max = Math.max(1, ...days.flatMap((x) => [x.made, x.sent]))
          return (
            <button key={p.id} type="button" className="card stk-card" onClick={() => onPick?.(p.id)}>
              <div className="row between">
                <b>{p.name}</b>
                <span className={cx('stk-upd', last && 'on')}>{last ? `${last.by || 'In-charge'} · ${ago(last.updatedAt)}` : 'No update today'}</span>
              </div>
              <div className="stk-hand">
                <b>{kgt(d.closing)}</b>
                <span>{packetText(d.closing, p)}</span>
              </div>
              <div className="stk-mini">
                <span>Made <b className="pos">{kgt(d.produced)}</b></span>
                <span>Sent <b>{kgt(d.dispatched)}</b></span>
                <span>Waste <b className={d.waste ? 'neg' : ''}>{kgt(d.waste)}</b></span>
              </div>
              <div className="stk-bars" title="Last 7 days: made (purple) vs sent (cyan)">
                {days.map((x) => (
                  <div key={x.dt} className="stk-bar">
                    <i className="m" style={{ height: `${(x.made / max) * 100}%` }} />
                    <i className="s" style={{ height: `${(x.sent / max) * 100}%` }} />
                    <small>{fmtDate(x.dt, { weekday: 'narrow' })}</small>
                  </div>
                ))}
              </div>
              <small className="muted">Wastage last 14 days: <b className={wastePct > 5 ? 'neg' : 'pos'}>{made14 ? `${wastePct.toFixed(1)}%` : '-'}</b></small>
            </button>
          )
        })}
      </div>
    </motion.section>
  )
}
