import { motion } from 'framer-motion'
import { hasLL } from '../lib/geo'

/** Schematic route map: start, numbered stops and the path between them (no map tiles needed). */
export default function RouteMap({ start, stops, color = '#7c5cff', height = 150 }) {
  const pts = []
  if (hasLL(start)) pts.push({ lat: start.lat, lng: start.lng, s: true })
  stops.forEach((s, i) => hasLL(s) && pts.push({ lat: s.lat, lng: s.lng, n: i + 1 }))
  const W = 320
  const H = height
  if (pts.length < 2)
    return (
      <div className="rmap empty" style={{ height }}>
        {stops.length ? 'Add map locations to see the route' : 'No stops yet'}
      </div>
    )
  const lat0 = pts.reduce((a, p) => a + p.lat, 0) / pts.length
  const kx = Math.cos((lat0 * Math.PI) / 180)
  const xs = pts.map((p) => p.lng * kx)
  const ys = pts.map((p) => -p.lat)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const pad = 20
  const sc = Math.min((W - 2 * pad) / (maxX - minX || 1e-6), (H - 2 * pad) / (maxY - minY || 1e-6))
  const ox = pad + (W - 2 * pad - (maxX - minX) * sc) / 2
  const oy = pad + (H - 2 * pad - (maxY - minY) * sc) / 2
  const P = pts.map((p, i) => ({ ...p, x: ox + (xs[i] - minX) * sc, y: oy + (ys[i] - minY) * sc }))
  const path = P.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  return (
    <svg className="rmap" viewBox={`0 0 ${W} ${H}`} style={{ height }} role="img" aria-label="Route map">
      <defs>
        <pattern id="gridp" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="rgba(255,255,255,.05)" />
        </pattern>
      </defs>
      <rect width={W} height={H} rx="14" fill="url(#gridp)" />
      <motion.path d={path} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="1 0" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: 'easeInOut' }} />
      <path d={path} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1" strokeDasharray="2 6" className="flow-dash" />
      {P.map((p, i) => (
        <motion.g key={i} initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.12 * i + 0.2, type: 'spring', damping: 12 }} style={{ transformOrigin: `${p.x}px ${p.y}px` }}>
          <circle cx={p.x} cy={p.y} r={p.s ? 9 : 8.5} fill={p.s ? '#2ee59d' : color} stroke="#0b1220" strokeWidth="2" />
          <text x={p.x} y={p.y + 3.6} textAnchor="middle" fontSize="10" fontWeight="800" fill={p.s ? '#04281d' : '#fff'}>
            {p.s ? 'S' : p.n}
          </text>
        </motion.g>
      ))}
    </svg>
  )
}
