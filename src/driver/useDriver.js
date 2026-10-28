import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { dpost, loadSession, saveSession } from './dapi'
import { todayStr } from '../lib/util'

const ROUTE = 'agenic.driver.route'
const QUEUE = 'agenic.driver.queue'
const OVER = 'agenic.driver.overlay'
const read = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k) || 'null') ?? d
  } catch {
    return d
  }
}
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v))
  } catch {
    /* storage full / blocked */
  }
}

/** All driver state: session, today's route, optimistic updates and an offline queue that retries by itself. */
export function useDriver() {
  const [session, setSession] = useState(loadSession)
  const [route, setRoute] = useState(() => read(ROUTE, null))
  const [overlay, setOverlay] = useState(() => read(OVER, {}))
  const [queueLen, setQueueLen] = useState(() => read(QUEUE, []).length)
  const [online, setOnline] = useState(navigator.onLine)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const queue = useRef(read(QUEUE, []))
  const flushing = useRef(false)
  const sess = useRef(session)
  sess.current = session

  const persistQ = () => {
    write(QUEUE, queue.current)
    setQueueLen(queue.current.length)
  }
  const logout = useCallback(() => {
    saveSession(null)
    localStorage.removeItem(ROUTE)
    localStorage.removeItem(OVER)
    localStorage.removeItem(QUEUE)
    queue.current = []
    setQueueLen(0)
    setSession(null)
    setRoute(null)
    setOverlay({})
  }, [])

  const login = async (driverId, pin) => {
    const r = await dpost('driverLogin', { driverId, pin })
    const s = { driver: r.driver, token: r.token }
    saveSession(s)
    setSession(s)
    return s
  }

  const refresh = useCallback(async () => {
    const s = sess.current
    if (!s) return
    setLoading(true)
    try {
      const r = await dpost('driverRoute', { driverId: s.driver.id, token: s.token, date: todayStr() })
      setRoute(r)
      write(ROUTE, r)
      setError('')
      setOnline(true)
      if (queue.current.length === 0) {
        setOverlay({})
        write(OVER, {})
      }
    } catch (e) {
      if (e.net) setOnline(false)
      else if (/Session expired|not available/i.test(e.message)) logout()
      else setError(e.message)
    }
    setLoading(false)
  }, [logout])

  const flush = useCallback(async () => {
    if (flushing.current || !sess.current) return
    flushing.current = true
    const s = sess.current
    try {
      while (queue.current.length) {
        const it = queue.current[0]
        try {
          if (it.k === 'u') await dpost('driverUpdate', { driverId: s.driver.id, token: s.token, deliveryId: it.deliveryId, patch: it.patch })
          else {
            const r = await dpost('driverVoice', { driverId: s.driver.id, token: s.token, deliveryId: it.deliveryId, mime: it.mime, data: it.data }, 60000)
            setOverlay((o) => {
              const n = { ...o, [it.deliveryId]: { ...(o[it.deliveryId] || {}), voiceId: r.voiceId, voicePending: false } }
              write(OVER, n)
              return n
            })
          }
          queue.current.shift()
          persistQ()
          setOnline(true)
        } catch (e) {
          if (e.net) {
            setOnline(false)
            break
          }
          if (/Session expired|not available/i.test(e.message)) {
            logout()
            break
          }
          setError(e.message) // a real rejection (e.g. order no longer yours): drop it so it cannot block the rest
          queue.current.shift()
          persistQ()
        }
      }
    } finally {
      flushing.current = false
    }
    if (queue.current.length === 0 && sess.current) refresh()
  }, [logout, refresh])

  const patchOverlay = (deliveryId, p) =>
    setOverlay((o) => {
      const n = { ...o, [deliveryId]: { ...(o[deliveryId] || {}), ...p } }
      write(OVER, n)
      return n
    })

  /** Save an update instantly on screen, send it in the background. */
  const act = (deliveryId, patch) => {
    patchOverlay(deliveryId, {
      ...patch,
      ...(patch.status === 'delivered' || patch.status === 'skipped' ? { doneAt: new Date().toISOString() } : {})
    })
    queue.current.push({ k: 'u', deliveryId, patch, at: Date.now() })
    persistQ()
    flush()
  }
  const sendVoice = (deliveryId, mime, data) => {
    patchOverlay(deliveryId, { voicePending: true })
    queue.current.push({ k: 'v', deliveryId, mime, data, at: Date.now() })
    persistQ()
    flush()
  }

  useEffect(() => {
    if (!session) return
    refresh()
    flush()
  }, [session?.token]) // eslint-disable-line

  useEffect(() => {
    const on = () => {
      setOnline(true)
      flush()
      refresh()
    }
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const vis = () => document.visibilityState === 'visible' && sess.current && (flush(), refresh())
    document.addEventListener('visibilitychange', vis)
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible' || !sess.current) return
      if (queue.current.length) flush()
      else refresh()
    }, 25000)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
      document.removeEventListener('visibilitychange', vis)
      clearInterval(id)
    }
  }, [flush, refresh])

  const stops = useMemo(
    () => (route?.stops || []).map((s) => ({ ...s, track: { ...s.track, ...(overlay[s.id] || {}) } })),
    [route, overlay]
  )
  return { session, route, stops, online, queueLen, error, setError, loading, login, logout, refresh, act, sendVoice }
}
