// Driver-side API. Talks to the same Apps Script web app, but only with name + PIN (never the admin key).
import { getCfg } from '../lib/api'

const SESSION = 'agenic.driver.session'
export const loadSession = () => {
  try {
    return JSON.parse(localStorage.getItem(SESSION) || 'null')
  } catch {
    return null
  }
}
export const saveSession = (s) => (s ? localStorage.setItem(SESSION, JSON.stringify(s)) : localStorage.removeItem(SESSION))

export async function dpost(action, body = {}, timeoutMs = 25000) {
  const { url } = getCfg()
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), timeoutMs)
  let res
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, ...body }),
      signal: ac.signal
    })
  } catch {
    clearTimeout(t)
    const e = new Error('No internet. Your updates are saved and will send when you are back online.')
    e.net = true
    throw e
  }
  clearTimeout(t)
  let j
  try {
    j = await res.json()
  } catch {
    const e = new Error('Server is busy. Retrying…')
    e.net = true
    throw e
  }
  if (!j.ok) throw new Error(j.error || 'Server error')
  return j.data
}

export const mapsTo = (s) =>
  s.lat != null && s.lng != null && s.lat !== '' && s.lng !== ''
    ? `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${s.lat},${s.lng}`
    : `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(s.address || s.name || '')}`
