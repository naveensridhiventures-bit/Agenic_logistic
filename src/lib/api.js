// Thin client for the Google Apps Script web app that sits on top of your Google Sheet.
const CFG = 'agenic.cfg'
// Built-in backend. Can be overridden in Settings or with VITE_API_URL / VITE_API_KEY.
const DEFAULT_URL =
  'https://script.google.com/macros/s/AKfycby7wN4kf7pZtwCYVdD1jstUXbp4ErZDXJYUCtZkx5-tDjP1ko1vdangCAkpAnmsJ4OwxQ/exec'
const DEFAULT_KEY = 'change-me-to-your-secret' // must equal API_KEY in Code.gs

export function getCfg() {
  let s = {}
  try {
    s = JSON.parse(localStorage.getItem(CFG) || '{}')
  } catch {
    /* ignore */
  }
  return {
    url: s.url || import.meta.env.VITE_API_URL || DEFAULT_URL,
    key: s.key || import.meta.env.VITE_API_KEY || DEFAULT_KEY
  }
}
export const setCfg = (c) => localStorage.setItem(CFG, JSON.stringify(c))
export const isConfigured = () => !!getCfg().url

async function parse(res) {
  let j
  try {
    j = await res.json()
  } catch {
    throw new Error('Backend did not return JSON - check the web app URL and that access is "Anyone".')
  }
  if (!j.ok) throw new Error(j.error || 'Server error')
  return j
}

export async function getAll(override) {
  const { url, key } = override || getCfg()
  const res = await fetch(`${url}?action=getAll&key=${encodeURIComponent(key)}`)
  return (await parse(res)).data
}

// text/plain keeps this a "simple" request, so the browser skips the CORS preflight Apps Script can't answer.
export async function post(body) {
  const { url, key } = getCfg()
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, key })
  })
  return parse(res)
}
