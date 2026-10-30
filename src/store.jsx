import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { buildReminder, computeDues, DEFAULT_SETTINGS } from './lib/calc'
import * as api from './lib/api'
import { sleep, todayStr, uid } from './lib/util'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

const live = api.isConfigured()
const CACHE = live ? 'agenic.live.v1' : 'agenic.demo.v1'
const QUEUE = 'agenic.queue.v1'

const emptyData = () => ({
  customers: [],
  deliveries: [],
  costs: [],
  trips: [],
  tracking: [],
  products: [],
  stock: [],
  payments: [],
  drivers: [],
  settings: { ...DEFAULT_SETTINGS },
  reminders: {}
})

function loadCache() {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE) || 'null')
    if (raw) return { ...emptyData(), ...raw, settings: { ...DEFAULT_SETTINGS, ...raw.settings } }
  } catch {
    /* ignore */
  }
  return emptyData()
}
const loadQueue = () => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE) || '[]')
  } catch {
    return []
  }
}

function normalize(raw) {
  const num = (v) => (v === '' || v == null ? 0 : Number(v))
  const ll = (v) => (v === '' || v == null || !Number.isFinite(Number(v)) ? null : Number(v))
  const out = {
    customers: (raw.customers || []).map((c) => ({
      ...c,
      id: String(c.id),
      rate: num(c.rate),
      creditLimit: num(c.creditLimit),
      maxDays: num(c.maxDays),
      profitPerKg: num(c.profitPerKg),
      lat: ll(c.lat),
      lng: ll(c.lng),
      locSource: c.locSource || '',
      remark: c.remark || '',
      stoppedOn: c.stoppedOn ? String(c.stoppedOn).slice(0, 10) : '',
      active: c.active === false || String(c.active).toUpperCase() === 'FALSE' ? false : true
    })),
    deliveries: (raw.deliveries || []).map((d) => ({
      ...d,
      id: String(d.id),
      customerId: String(d.customerId),
      qty: num(d.qty),
      rate: num(d.rate),
      cost: num(d.cost),
      driverId: d.driverId ? String(d.driverId) : '',
      seq: num(d.seq)
    })),
    drivers: (raw.drivers || []).map((d) => ({
      ...d,
      id: String(d.id),
      capacityKg: num(d.capacityKg),
      baseRoute: String(d.baseRoute || ''),
      pin: String(d.pin || ''),
      startLat: ll(d.startLat),
      startLng: ll(d.startLng),
      active: d.active === false || String(d.active).toUpperCase() === 'FALSE' ? false : true
    })),
    costs: (raw.costs || []).map((c) => ({
      ...c,
      id: String(c.id),
      driver: num(c.driver),
      diesel: num(c.diesel),
      porter: num(c.porter),
      other: num(c.other),
      loadman: num(c.loadman),
      helper: num(c.helper),
      maintenance: num(c.maintenance)
    })),
    products: (raw.products || []).map((p) => ({
      ...p,
      id: String(p.id),
      name: String(p.name || ''),
      packetKg: num(p.packetKg),
      buffer: p.buffer === '' || p.buffer == null ? 5 : num(p.buffer),
      shelfDays: num(p.shelfDays),
      main: p.main === true || String(p.main).toLowerCase() === 'true',
      active: !(p.active === false || String(p.active).toLowerCase() === 'false')
    })),
    stock: (raw.stock || []).map((r) => ({ ...r, id: String(r.id), date: String(r.date), productId: String(r.productId), kg: num(r.kg) })),
    tracking: (raw.tracking || []).map((t) => ({ ...t, id: String(t.id), payAmount: num(t.payAmount) })),
    trips: (raw.trips || []).map((t) => ({
      ...t,
      id: String(t.id),
      date: String(t.date),
      mode: t.mode || 'Porter',
      cost: num(t.cost),
      customerIds: String(t.customerIds || '')
    })),
    payments: (raw.payments || []).map((p) => ({
      ...p,
      id: String(p.id),
      customerId: String(p.customerId),
      amount: num(p.amount)
    })),
    settings: {
      ...DEFAULT_SETTINGS,
      ...Object.fromEntries(
        Object.entries(raw.settings || {}).map(([k, v]) => [
          k,
          typeof DEFAULT_SETTINGS[k] === 'number' ? num(v) || DEFAULT_SETTINGS[k] : v
        ])
      )
    }
  }
  // every driver starts from (and returns to) the pickup point unless given another start
  const st = out.settings
  out.drivers = out.drivers.map((d) =>
    d.startLat != null && d.startLng != null ? d : { ...d, startLat: st.depotLat, startLng: st.depotLng, startAddress: d.startAddress || st.depotName }
  )
  return out
}

const upsertRow = (rows, row) => {
  const i = rows.findIndex((r) => String(r.id) === String(row.id))
  if (i < 0) return [...rows, row]
  const next = rows.slice()
  next[i] = { ...rows[i], ...row }
  return next
}

export function AppProvider({ children }) {
  const [data, setData] = useState(loadCache)
  const [ready, setReady] = useState(!live)
  const [sync, setSync] = useState(live ? 'syncing' : 'demo')
  const [syncError, setSyncError] = useState('')
  const [date, setDate] = useState(todayStr())
  const [tab, setTab] = useState('dash')
  const [popup, setPopup] = useState(false)
  const [driversOpen, setDriversOpen] = useState(false)
  const [assignFor, setAssignFor] = useState(null) // delivery id being assigned
  const [toasts, setToasts] = useState([])
  const queue = useRef(loadQueue())
  const flushing = useRef(false)

  useEffect(() => {
    try {
      localStorage.setItem(CACHE, JSON.stringify(data))
    } catch {
      /* storage full / blocked */
    }
  }, [data])

  const toast = useCallback((msg, type = 'ok') => {
    const id = uid()
    setToasts((t) => [...t, { id, msg, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200)
  }, [])

  const saveQueue = () => localStorage.setItem(QUEUE, JSON.stringify(queue.current))

  const flush = useCallback(async () => {
    if (!api.isConfigured() || flushing.current) return
    flushing.current = true
    setSync('syncing')
    try {
      while (queue.current.length) {
        await api.post(queue.current[0])
        queue.current.shift()
        saveQueue()
      }
      setSync('synced')
      setSyncError('')
    } catch (e) {
      // Older deployed script without bulk support: fall back to one row at a time.
      const op = queue.current[0]
      if (op?.action === 'upsertMany' && /Unknown action/i.test(e.message || '')) {
        queue.current.splice(0, 1, ...op.rows.map((row) => ({ action: 'upsert', sheet: op.sheet, row })))
        saveQueue()
        flushing.current = false
        return flush()
      }
      setSync('offline')
      setSyncError(e.message || 'Could not reach the backend')
    } finally {
      flushing.current = false
    }
  }, [])

  const enqueue = (op) => {
    if (!api.isConfigured()) return
    queue.current.push(op)
    saveQueue()
    flush()
  }

  const pull = useCallback(async () => {
    if (!api.isConfigured()) return
    await flush()
    if (queue.current.length) return // unsent edits - don't overwrite them
    try {
      setSync('syncing')
      const raw = await api.getAll()
      setData((d) => ({ ...d, ...normalize(raw) }))
      setSync('synced')
      setSyncError('')
    } catch (e) {
      setSync('offline')
      setSyncError(e.message)
    } finally {
      setReady(true)
    }
  }, [flush])

  useEffect(() => {
    pull()
    const on = () => pull()
    window.addEventListener('online', on)
    return () => window.removeEventListener('online', on)
  }, [pull])

  // ---- data actions ----
  const upsert = (sheet, row) => {
    setData((d) => ({ ...d, [sheet]: upsertRow(d[sheet], row) }))
    enqueue({ action: 'upsert', sheet, row })
  }
  const remove = (sheet, id) => {
    setData((d) => ({ ...d, [sheet]: d[sheet].filter((r) => String(r.id) !== String(id)) }))
    enqueue({ action: 'remove', sheet, id })
  }
  const saveSettings = (settings) => {
    setData((d) => ({ ...d, settings: { ...d.settings, ...settings } }))
    enqueue({ action: 'saveSettings', settings })
  }
  const upsertMany = (sheet, rows) => {
    setData((d) => ({ ...d, [sheet]: rows.reduce(upsertRow, d[sheet]) }))
    enqueue({ action: 'upsertMany', sheet, rows })
  }

  const dues = useMemo(() => computeDues(data), [data])

  const sendReminder = async (item, { silent } = {}) => {
    const c = item.customer
    if (!c.email) {
      toast(`Add an email for ${c.name} first`, 'warn')
      return false
    }
    const { subject, body } = buildReminder(item, data.settings)
    try {
      if (api.isConfigured()) {
        await api.post({ action: 'sendReminder', customerId: c.id, subject, body })
      } else {
        await sleep(800)
      }
      setData((d) => ({ ...d, reminders: { ...d.reminders, [c.id]: new Date().toISOString() } }))
      if (!silent) toast(api.isConfigured() ? `Reminder emailed to ${c.name}` : `Demo: reminder to ${c.email} (connect the backend to really send)`)
      return true
    } catch (e) {
      toast(`Email failed: ${e.message}`, 'bad')
      return false
    }
  }

  // ---- limit alerts: pop up whenever a NEW customer crosses a limit ----
  const seen = useRef(new Set())
  const breaches = dues.filter((d) => d.status === 'breach')
  useEffect(() => {
    if (!ready) return
    const fresh = breaches.filter((b) => !seen.current.has(b.customer.id))
    breaches.forEach((b) => seen.current.add(b.customer.id))
    // forget customers that recovered so they can alert again later
    for (const id of [...seen.current]) if (!breaches.some((b) => b.customer.id === id)) seen.current.delete(id)
    if (fresh.length) setPopup(true)
  }, [breaches.map((b) => b.customer.id).join(','), ready]) // eslint-disable-line

  const value = {
    data,
    dues,
    breaches,
    ready,
    sync,
    syncError,
    live,
    date,
    setDate,
    tab,
    setTab,
    popup,
    setPopup,
    driversOpen,
    setDriversOpen,
    assignFor,
    setAssignFor,
    toasts,
    toast,
    upsert,
    remove,
    saveSettings,
    upsertMany,
    sendReminder,
    pull
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
