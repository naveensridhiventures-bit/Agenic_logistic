import { getCfg } from './api'

/** Same formula as the Apps Script: a 4-digit code per stop (or per driver's final return) that only the admin can see. */
export async function unlockCode(key) {
  const enc = new TextEncoder()
  const k = await crypto.subtle.importKey('raw', enc.encode(getCfg().key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode('unlock|' + key)))
  const n = h[0] * 16777216 + h[1] * 65536 + h[2] * 256 + h[3]
  return String(n % 10000).padStart(4, '0')
}
export const stopKey = (deliveryId) => `del|${deliveryId}`
export const returnKey = (driverId, date) => `ret|${driverId}|${date}`
