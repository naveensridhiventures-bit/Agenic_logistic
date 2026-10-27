// Small CSV / pasted-spreadsheet parser for the bulk customer import.
export function parseCSV(text) {
  const first = text.split(/\r?\n/)[0] || ''
  const d = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ','
  const rows = []
  let row = []
  let cur = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"'
          i++
        } else q = false
      } else cur += ch
    } else if (ch === '"') q = true
    else if (ch === d) {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(cur)
      cur = ''
      rows.push(row)
      row = []
    } else cur += ch
  }
  if (cur !== '' || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const ALIAS = {
  name: ['name', 'hotel', 'hotelname', 'customer', 'customername', 'business', 'businessname'],
  area: ['area', 'locality', 'place', 'city'],
  address: ['address', 'location', 'locationasprovided', 'fulladdress'],
  phone: ['phone', 'mobile', 'contact', 'phonenumber', 'mobilenumber'],
  email: ['email', 'mail', 'emailid', 'emailaddress'],
  rate: ['rate', 'price', 'rateperkg', 'priceperkg'],
  creditLimit: ['creditlimit', 'limit', 'credit'],
  maxDays: ['maxdays', 'maxunpaiddays', 'days', 'unpaiddays']
}
const num = (v) => Number(String(v ?? '').replace(/[₹,\s]/g, '')) || 0

export const TEMPLATE = 'name,phone,address,area,email,rate,creditLimit,maxDays\n'
export const mapUrl = (address) =>
  address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : ''

/** "+91 96779 97847" -> "9677997847" */
export const cleanPhone = (v) => {
  const d = String(v ?? '').replace(/\D/g, '')
  return d.length > 10 ? d.slice(-10) : d
}

/** Names sometimes carry the price: "Manikandan price 32", "cholan mess perungudi 33". */
function splitNamePrice(name) {
  const m = name.match(/\s*\b(?:price\s*)?(\d{2})\b(?!\s*kg)/i)
  if (!m) return { name, rate: 0 }
  const rate = Number(m[1])
  if (rate < 15 || rate > 99) return { name, rate: 0 }
  const clean = (name.slice(0, m.index) + ' ' + name.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim()
  return { name: clean || name, rate }
}

/** Best-effort locality from a Google-style address ("..., Sholinganallur, Chennai, Tamil Nadu 600119"). */
function areaFromAddress(address) {
  if (!address) return ''
  const parts = address
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p && !/^(greater\s+)?chennai$/i.test(p) && !/tamil\s*nadu/i.test(p) && !/^\d{6}$/.test(p))
  const good = parts.filter((p) => !/^[A-Z0-9]{4}\+[A-Z0-9]{2,3}/.test(p) && !/^(no\.?\s*)?[\d\-/]+$/i.test(p))
  return (good[good.length - 1] || '').replace(/^[A-Z0-9]{4}\+[A-Z0-9]{2,3}\s*/, '')
}

const titleCase = (s) => (s === s.toLowerCase() ? s.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : s)

/** rows: 2-D array, first row = headers. Works for CSV text, pasted cells and .xlsx sheets. */
export function customersFromRows(rows, defaults = {}) {
  rows = rows.filter((r) => r.some((c) => String(c ?? '').trim() !== ''))
  if (rows.length < 2) return { rows: [], errors: ['Needs a header row and at least one customer.'] }
  const head = rows[0].map((h) => String(h ?? '').toLowerCase().replace(/[^a-z]/g, ''))
  const idx = {}
  for (const [k, al] of Object.entries(ALIAS)) idx[k] = head.findIndex((h) => al.includes(h))
  if (idx.name < 0) return { rows: [], errors: ['No "name" column found in the header row.'] }
  const get = (r, k) => (idx[k] >= 0 ? String(r[idx[k]] ?? '').trim() : '')
  const out = []
  const errors = []
  rows.slice(1).forEach((r, i) => {
    const raw = get(r, 'name')
    if (!raw) return errors.push(`Row ${i + 2}: name is empty - skipped`)
    const { name, rate: nameRate } = splitNamePrice(raw)
    const address = get(r, 'address')
    out.push({
      name: titleCase(name),
      area: get(r, 'area') || areaFromAddress(address),
      phone: cleanPhone(get(r, 'phone')),
      email: get(r, 'email'),
      address,
      mapUrl: mapUrl(address),
      rate: num(get(r, 'rate')) || nameRate || defaults.rate || 0,
      creditLimit: num(get(r, 'creditLimit')),
      maxDays: num(get(r, 'maxDays')),
      active: true
    })
  })
  return { rows: out, errors }
}

export const customersFromText = (text, defaults) => customersFromRows(parseCSV(text || ''), defaults)

export async function rowsFromXlsx(file) {
  const { readSheet } = await import('read-excel-file/browser')
  return readSheet(file) // first sheet as an array of rows
}
