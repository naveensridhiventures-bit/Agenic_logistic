import { useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import { Icon, Modal, stagger, rise } from './ui'
import { inr, fmtDate } from '../lib/util'

export default function AlertPopup() {
  const { popup, setPopup, breaches, sendReminder, setTab, data, toast } = useApp()
  const [busy, setBusy] = useState({})
  const [all, setAll] = useState(false)

  const one = async (b) => {
    setBusy((s) => ({ ...s, [b.customer.id]: true }))
    await sendReminder(b)
    setBusy((s) => ({ ...s, [b.customer.id]: false }))
  }
  const sendAll = async () => {
    setAll(true)
    let ok = 0
    for (const b of breaches) if (await sendReminder(b, { silent: true })) ok++
    setAll(false)
    if (ok) toast(`${ok} reminder email${ok > 1 ? 's' : ''} sent`)
  }

  return (
    <Modal open={popup && breaches.length > 0} onClose={() => setPopup(false)} danger wide>
      <div className="alert-head">
        <motion.div
          className="alert-ic"
          animate={{ rotate: [0, -12, 10, -8, 6, 0], scale: [1, 1.08, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 1.6 }}
        >
          <Icon name="bell" size={28} />
        </motion.div>
        <div>
          <h3>Payment limit crossed</h3>
          <p>
            {breaches.length} customer{breaches.length > 1 ? 's have' : ' has'} passed the credit limit you set. Please
            collect payment or hold further deliveries.
          </p>
        </div>
        <button className="icon-btn" onClick={() => setPopup(false)} aria-label="Close">
          <Icon name="x" size={18} />
        </button>
      </div>

      <motion.div className="alert-list" variants={stagger} initial="hidden" animate="show">
        {breaches.map((b) => (
          <motion.div key={b.customer.id} variants={rise} className="alert-row">
            <div className="avatar bad">{b.customer.name[0]}</div>
            <div className="alert-info">
              <b>{b.customer.name}</b>
              <small>
                {b.reasons.join(' · ')}
                {b.oldest && ` · since ${fmtDate(b.oldest)}`}
              </small>
            </div>
            <div className="alert-amt">{inr(b.outstanding)}</div>
            <button className="btn ghost sm" disabled={busy[b.customer.id] || all} onClick={() => one(b)}>
              <Icon name="mail" size={16} /> {busy[b.customer.id] ? 'Sending…' : 'Remind'}
            </button>
          </motion.div>
        ))}
      </motion.div>

      <div className="modal-actions">
        <button className="btn ghost" onClick={() => setPopup(false)}>
          Dismiss
        </button>
        <button
          className="btn ghost"
          onClick={() => {
            setPopup(false)
            setTab('cust')
          }}
        >
          View customers
        </button>
        <button className="btn danger" disabled={all} onClick={sendAll}>
          <Icon name="mail" size={16} /> {all ? 'Sending…' : `Email all ${breaches.length}`}
        </button>
      </div>
      {data.settings.ownerEmail && <p className="tiny">A copy of each reminder is sent to {data.settings.ownerEmail}.</p>}
    </Modal>
  )
}
