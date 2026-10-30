import React, { Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './driver/driver.css'

const qs = new URLSearchParams(location.search)
const isStock = qs.has('stock') || location.hash === '#stock'
const isDriver = !isStock && (qs.has('driver') || location.hash === '#driver')

if (isDriver || isStock) {
  // Make "Add to Home screen" install the driver app (it opens straight to driver login), not the admin app.
  const icons = [
    { src: `${location.origin}/icon-192.png`, sizes: '192x192', type: 'image/png' },
    { src: `${location.origin}/icon-512.png`, sizes: '512x512', type: 'image/png' },
    { src: `${location.origin}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ]
  const manifest = {
    name: isStock ? 'Agenic Stock' : 'Agenic Driver',
    short_name: isStock ? 'Agenic Stock' : 'Agenic Driver',
    start_url: `${location.origin}/?${isStock ? 'stock' : 'driver'}=1`,
    scope: `${location.origin}/`,
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#070b16',
    background_color: '#070b16',
    icons
  }
  const url = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }))
  let link = document.querySelector('link[rel="manifest"]')
  if (!link) {
    link = document.createElement('link')
    link.rel = 'manifest'
    document.head.appendChild(link)
  }
  link.href = url
  document.documentElement.classList.add('driver-mode')
  document.title = isStock ? 'Agenic Stock' : 'Agenic Driver'
  document.querySelector('meta[name="viewport"]')?.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
}

const App = React.lazy(() => (isStock ? import('./stock/StockApp') : isDriver ? import('./driver/DriverApp') : import('./App')))

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Suspense fallback={null}>
      <App />
    </Suspense>
  </React.StrictMode>
)
