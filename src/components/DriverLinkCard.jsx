import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import { Icon } from './ui'

/** Attractive banner at the top: the link drivers open on their phone, with copy, WhatsApp share and QR. */
export default function DriverLinkCard() {
  const { toast, setDriversOpen, data } = useApp()
  const link = `${location.origin}/?driver=1`
  const [qr, setQr] = useState('')
  const [showQr, setShowQr] = useState(false)
  const ready = data.drivers.filter((d) => d.pin).length

  useEffect(() => {
    if (!showQr || qr) return
    import('qrcode').then((Q) => Q.toDataURL(link, { margin: 1, width: 300 }).then(setQr))
  }, [showQr]) // eslint-disable-line

  const copy = () => navigator.clipboard?.writeText(link).then(() => toast('Driver link copied'), () => toast(link))
  const wa = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Agenic driver app: ${link}\nOpen it on your phone, choose your name and enter your PIN. Tap Add to Home screen to install.`)}`, '_blank', 'noopener')

  return (
    <motion.div className="dlink" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="dlink-ic">
        <Icon name="phone" size={22} />
      </div>
      <div className="dlink-main">
        <small>Driver app link · {ready ? `${ready} driver${ready === 1 ? '' : 's'} with login` : 'set a PIN for each driver'}</small>
        <a href={link} target="_blank" rel="noopener noreferrer">
          {link.replace(/^https?:\/\//, '')}
        </a>
      </div>
      <div className="dlink-actions">
        <button type="button" className="btn ghost sm" onClick={copy}>
          Copy
        </button>
        <button type="button" className="btn ghost sm" onClick={wa}>
          WhatsApp
        </button>
        <button type="button" className="btn ghost sm" onClick={() => setShowQr((v) => !v)}>
          {showQr ? 'Hide QR' : 'QR'}
        </button>
        <button type="button" className="btn primary sm" onClick={() => setDriversOpen(true)}>
          Drivers &amp; PINs
        </button>
      </div>
      {showQr && (
        <motion.div className="dlink-qr" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
          {qr ? <img src={qr} alt="Driver app QR" /> : <span className="muted">Making QR…</span>}
          <small>Driver scans this with his phone camera</small>
        </motion.div>
      )}
    </motion.div>
  )
}
