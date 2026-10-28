import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import { logRange } from '../lib/deliveryLog'
import { addDays, cx, fmtDate, inr, kgf, todayStr } from '../lib/util'
import { Empty, Icon, rise, stagger } from './ui'

/** Date-wise record of deliveries: how many were delivered, money collected, notes. Open a day for stop-level detail and voice notes. */
export default function DeliveryHistory({ onOpenDay }) {
  const { data, toast } = useApp()
  const [span, setSpan] = useState(14)
  const [busy, setBusy] = useState('')
  const to = todayStr()
  const from = addDays(to, -(span - 1))
  const days = useMemo(() => logRange(from, to, data), [data, from, to])

  const pdf = async (share) => {
    setBusy(share ? 'share' : 'pdf')
    try {
      const [{ buildDeliveryPdf }, { sharePdf }] = await Promise.all([import('../lib/deliveryPdf'), import('../lib/report')])
      const { doc, filename } = await buildDeliveryPdf({ from, to, data })
      if (share) {
        const r = await sharePdf(doc, filename, `Agenic delivery report ${from} to ${to}`)
        if (r === 'downloaded') toast('Sharing not supported here - PDF downloaded instead')
      } else {
        doc.save(filename)
        toast('Delivery report downloaded')
      }
    } catch (e) {
      toast(e.message, 'bad')
    }
    setBusy('')
  }

  return (
    <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise} className="row between wrap">
        <div className="seg">
          {[7, 14, 30].map((n) => (
            <button key={n} type="button" className={cx(span === n && 'on')} onClick={() => setSpan(n)}>
              {span === n && <motion.i layoutId="histseg" className="seg-pill" transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
              <span>Last {n} days</span>
            </button>
          ))}
        </div>
        <div className="row gap wrap">
          <button className="btn primary" disabled={!days.length || !!busy} onClick={() => pdf(false)}>
            <Icon name="download" size={16} /> {busy === 'pdf' ? 'Creating…' : 'Delivery report PDF'}
          </button>
          <button className="btn ghost" disabled={!days.length || !!busy} onClick={() => pdf(true)}>
            <Icon name="mail" size={16} /> Share
          </button>
        </div>
      </motion.div>

      {!days.length && <Empty icon="truck" title="No orders in this period" text="Orders and driver updates will be listed here date by date." />}

      <div className="hist">
        {days.map((d) => (
          <motion.button key={d.date} variants={rise} type="button" className="card hist-row" onClick={() => onOpenDay(d.date)}>
            <div className="hist-date">
              <b>{fmtDate(d.date, { day: 'numeric', month: 'short' })}</b>
              <small>{fmtDate(d.date, { weekday: 'long' })}</small>
            </div>
            <div className="hist-bar">
              <div className="track">
                <i className="pos" style={{ width: `${d.orders ? (d.done / d.orders) * 100 : 0}%` }} />
              </div>
              <small>
                {d.done} of {d.orders} delivered{d.skipped ? ` · ${d.skipped} not delivered` : ''} · {kgf(d.kg)}
              </small>
            </div>
            <div className="hist-nums">
              <span>
                Bill <b>{inr(d.bill)}</b>
              </span>
              {d.notes > 0 && <span className="muted">{d.notes} note{d.notes === 1 ? '' : 's'}</span>}
            </div>
            <Icon name="right" size={18} />
          </motion.button>
        ))}
      </div>
    </motion.div>
  )
}
