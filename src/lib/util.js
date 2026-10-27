export const pad = (n) => String(n).padStart(2, '0')
export const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const todayStr = () => toStr(new Date())
export const parse = (s) => {
  const [y, m, d] = String(s).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const addDays = (s, n) => {
  const d = parse(s)
  d.setDate(d.getDate() + n)
  return toStr(d)
}
export const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 864e5)
export const fmtDate = (s, opts) =>
  parse(s).toLocaleDateString('en-IN', opts || { day: 'numeric', month: 'short' })
export const fmtLong = (s) =>
  parse(s).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

export const inr = (n, sign = false) => {
  const v = Math.round(Number(n) || 0)
  const body = Math.abs(v).toLocaleString('en-IN')
  return (v < 0 ? '-' : sign && v > 0 ? '+' : '') + '₹' + body
}
export const kgf = (n) => `${Math.round((Number(n) || 0) * 10) / 10} kg`

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
export const sum = (arr, fn) => arr.reduce((s, x) => s + (Number(fn(x)) || 0), 0)
export const cx = (...a) => a.filter(Boolean).join(' ')
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
