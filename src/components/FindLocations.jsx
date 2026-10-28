import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import { geocodeCustomer, parseLocation } from '../lib/geo'
import { Icon, Modal } from './ui'

/** Finds map coordinates for customers: plus codes instantly, the rest via OpenStreetMap search. */
export default function FindLocations({ open, onClose, date }) {
  const { data, upsertMany } = useApp()
  const [run, setRun] = useState(null)
  const abort = useRef(null)
  const missing = data.customers.filter((c) => c.active !== false && c.lat == null)
  const ordered = new Set(data.deliveries.filter((d) => d.date === date).map((d) => d.customerId))
  const todays = missing.filter((c) => ordered.has(c.id))

  const start = async (list) => {
    const ac = new AbortController()
    abort.current = ac
    let found = 0
    let approx = 0
    let netErrors = 0
    const failed = []
    let batch = []
    setRun({ done: 0, total: list.length, current: '', found, approx, failed, finished: false })
    for (let i = 0; i < list.length; i++) {
      if (ac.signal.aborted) break
      const c = list[i]
      setRun((r) => ({ ...r, done: i, current: c.name }))
      let loc = parseLocation(c.address)
      if (!loc) {
        try {
          loc = await geocodeCustomer(c, ac.signal)
          netErrors = 0
        } catch (e) {
          if (e.name === 'AbortError') break
          failed.push(c.name)
          if (++netErrors >= 3) {
            setRun((r) => ({ ...r, error: `Map search is not reachable (${e.message}). Check your internet and try again.` }))
            break
          }
          continue
        }
      }
      if (loc) {
        batch.push({ ...c, lat: loc.lat, lng: loc.lng, locSource: loc.source })
        loc.source === 'approx' ? approx++ : found++
      } else failed.push(c.name)
      if (batch.length >= 8) {
        upsertMany('customers', batch)
        batch = []
      }
      setRun((r) => ({ ...r, found, approx, failed: [...failed] }))
    }
    if (batch.length) upsertMany('customers', batch)
    setRun((r) => ({ ...r, finished: true, done: list.length, found, approx, failed }))
  }
  const stop = () => abort.current?.abort()
  const close = () => {
    stop()
    setRun(null)
    onClose()
  }
  const running = run && !run.finished && !run.error
  const pct = run ? Math.round((run.done / Math.max(1, run.total)) * 100) : 0

  return (
    <Modal open={open} onClose={close}>
      <div className="form">
        <div className="row between">
          <h3 className="h3">
            <Icon name="pin" size={18} /> Find customer locations
          </h3>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close">
            <Icon name="x" size={18} />
          </button>
        </div>
        <p className="muted">
          Accurate routes need a map point for each customer. Plus codes in addresses are read instantly; other addresses are searched on OpenStreetMap (about 1 second each). Results marked <b>Check location</b> are approximate: confirm them in Customers by pasting the exact Google Maps link.
        </p>
        <div className="preview solid">
          <span>
            <b>{missing.length}</b> customers without a map location · <b>{todays.length}</b> have orders on this date
          </span>
        </div>

        {run && (
          <div className="stack" style={{ gap: 10 }}>
            <div className="track">
              <motion.i className="pos" animate={{ width: `${pct}%` }} />
            </div>
            <small className="muted">
              {run.finished ? 'Finished.' : run.error ? '' : `Searching: ${run.current || '…'} (${run.done}/${run.total})`} Found {run.found} · approximate {run.approx} · not found {run.failed.length}
            </small>
            {run.error && <small className="neg">{run.error}</small>}
            {run.finished && run.failed.length > 0 && <small className="warn">Not found: {run.failed.slice(0, 8).join(', ')}{run.failed.length > 8 ? '…' : ''}. Add these by pasting a Google Maps link in Customers.</small>}
          </div>
        )}

        <div className="modal-actions">
          {running ? (
            <button className="btn danger" onClick={stop}>
              Stop
            </button>
          ) : (
            <>
              <button className="btn ghost" disabled={!todays.length} onClick={() => start(todays)}>
                Locate this date's customers ({todays.length})
              </button>
              <button className="btn primary" disabled={!missing.length} onClick={() => start(missing)}>
                Locate all ({missing.length})
              </button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
