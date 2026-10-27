// Renders public/icon.svg into the PNG icons the PWA manifest needs.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const svg = readFileSync(join(root, 'icon.svg'), 'utf8')
const browser = await chromium.launch()
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } })
  await page.setContent(`<style>*{margin:0}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`)
  await page.screenshot({ path: join(root, `icon-${size}.png`) })
  await page.close()
}
await browser.close()
console.log('icons written')
