import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import { ageOf, convText, dayStock, packetText, packets, stockId, stockSummaryRange, suggestProduction } from '../lib/stock'
import { addDays, cx, fmtDate, todayStr, uid } from '../lib/util'
import { StockDashboard, StockLoginCard } from '../components/StockDash'
import { DateNav, Empty, Field, Icon, Modal, rise, stagger } from '../components/ui'

const PRESETS = [
  { name: 'Idli batter · 5 kg packet', packetKg: 5, buffer: 5, shelfDays: 2, main: true },
  { name: 'Idli batter · 1 kg packet', packetKg: 1, buffer: 5, shelfDays: 2, main: false },
  { name: 'Vada batter · 1 kg packet', packetKg: 1, buffer: 5, shelfDays: 2, main: false },
  { name: 'Vada batter · 5 kg packet', packetKg: 5, buffer: 5, shelfDays: 2, main: false },
  { name: 'Sridhi plain packets', packetKg: 0.5, buffer: 5, shelfDays: 2, main: false }
]
const packName = (name, size) => (size > 0 ? `${name} · ${size} kg packet` : name)
const kgt = (n) => `${Math.round((Number(n) || 0) * 100) / 100} kg`
const blankP = { id: null, name: '', packetKg: '1', sizes: '1, 5', buffer: '5', shelfDays: '2', main: false }

export default function Stock() {
  const { data, date, upsert, upsertMany, remove, toast, pull } = useApp()
  useEffect(() => {
    const t = setInterval(() => pull?.(), 20000)
    return () => clearInterval(t)
  }, [pull])
  const products = data.products.filter((p) => p.active !== false)
  const [pid, setPid] = useState('')
  const product = products.find((p) => p.id === pid) || products[0]
  const [unit, setUnit] = useState('kg')
  const [f, setF] = useState({ produce: '', dispatch: '', waste: '', note: '' })
  const [edit, setEdit] = useState(null)
  const [span, setSpan] = useState(14)
  const [busy, setBusy] = useState('')
  const [rep, setRep] = useState({ mode: 'span', from: addDays(todayStr(), -6), to: todayStr() })
  const repRange = () => {
    const t = todayStr()
    const dow = (new Date(t + 'T00:00:00').getDay() + 6) % 7
    if (rep.mode === 'today') return { from: t, to: t, label: 'TODAY' }
    if (rep.mode === 'week') return { from: addDays(t, -dow), to: t, label: 'THIS WEEK' }
    if (rep.mode === 'custom') return { from: rep.from, to: rep.to, label: 'CUSTOM PERIOD' }
    return { from: addDays(t, -(span - 1)), to: t, label: `LAST ${span} DAYS` }
  }

  const rowsOf = (t) => data.stock.find((s) => s.id === stockId(date, product?.id, t))
  // load that day's saved numbers (always shown in kg) when date / product changes
  useEffect(() => {
    if (!product) return
    const g = (t) => data.stock.find((s) => s.id === stockId(date, product.id, t))
    const k = Number(product.packetKg) || 0
    const show = (t) => {
      const v = g(t)?.kg
      return v ? (k ? Math.round((v / k) * 100) / 100 : v) : ''
    }
    setUnit(k ? 'pk' : 'kg')
    setF({ produce: show('produce'), dispatch: show('dispatch'), waste: show('waste'), note: g('produce')?.note || g('dispatch')?.note || '' })
  }, [date, product?.id]) // eslint-disable-line

  const pk = Number(product?.packetKg) || 0
  const toKg = (v) => (unit === 'pk' && pk ? (Number(v) || 0) * pk : Number(v) || 0)
  const switchUnit = (u) => {
    if (u === unit || !pk) return
    const conv = (v) => (v === '' ? '' : String(Math.round((u === 'pk' ? Number(v) / pk : Number(v) * pk) * 100) / 100))
    setF((x) => ({ ...x, produce: conv(x.produce), dispatch: conv(x.dispatch), waste: conv(x.waste) }))
    setUnit(u)
  }
  const vals = { produce: toKg(f.produce), dispatch: toKg(f.dispatch), waste: toKg(f.waste) }

  const carry = useMemo(() => (product ? dayStock({ ...product }, addDays(date, 0), { ...data, stock: data.stock.filter((s) => !(s.date === date && s.productId === product.id)) }) : null), [data, date, product])
  const preview = useMemo(() => {
    if (!product) return null
    const others = data.stock.filter((s) => !(s.date === date && s.productId === product.id))
    const mine = Object.entries(vals).filter(([, v]) => v > 0).map(([type, kg]) => ({ id: stockId(date, product.id, type), date, productId: product.id, type, kg, note: '' }))
    return dayStock(product, date, { ...data, stock: [...others, ...mine] })
  }, [data, date, product, f, unit]) // eslint-disable-line
  const sug = useMemo(() => (product ? suggestProduction(product, date, data) : null), [data, date, product])
  const nextDay = addDays(date, 1)
  const sugToday = useMemo(() => (product ? suggestProduction(product, date, data) : null), [data, date, product])
  const sugNext = useMemo(() => {
    if (!product) return null
    const others = data.stock.filter((s) => !(s.date === date && s.productId === product.id))
    const mine = Object.entries(vals).filter(([, v]) => v > 0).map(([type, kg]) => ({ id: stockId(date, product.id, type), date, productId: product.id, type, kg, note: '' }))
    return suggestProduction(product, nextDay, { ...data, stock: [...others, ...mine] })
  }, [data, date, product, f, unit]) // eslint-disable-line
  const ordered = product?.main ? data.deliveries.filter((d) => d.date === date).reduce((s, d) => s + d.qty, 0) : 0
  const history = useMemo(() => (product ? stockSummaryRange(product, addDays(todayStr(), -(span - 1)), todayStr(), data) : []), [data, product, span])

  const save = () => {
    const rows = []
    for (const t of ['produce', 'dispatch', 'waste']) {
      const id = stockId(date, product.id, t)
      const existing = data.stock.find((s) => s.id === id)
      if (vals[t] > 0) rows.push({ id, date, productId: product.id, type: t, kg: Math.round(vals[t] * 1000) / 1000, note: f.note, by: 'Admin', updatedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 19) })
      else if (existing) remove('stock', id)
    }
    if (rows.length) upsertMany('stock', rows)
    toast(rows.length || !data.stock.length ? `${product.name} stock saved for ${fmtDate(date, { day: 'numeric', month: 'short' })}` : 'Entries cleared')
  }

  const saveProduct = () => {
    const name = edit.name.trim()
    if (!name) return toast('Enter the product name', 'warn')
    if (!edit.id) {
      const dup = [...new Set(String(edit.sizes || '').split(/[,\s]+/).map(Number).filter((x) => x > 0))].map((sz) => packName(name, sz)).concat(String(edit.sizes || '').trim() ? [] : [name]).find((n) => data.products.some((x) => x.active !== false && x.name.toLowerCase() === n.toLowerCase()))
      if (dup) return toast(`${dup} already exists`, 'warn')
      const sizes = [...new Set(String(edit.sizes || '').split(/[,\s]+/).map((x) => Number(x)).filter((x) => x > 0))]
      const list = sizes.length ? sizes : [0]
      const rows = list.map((sz, i) => ({ id: uid(), name: packName(name, sz), packetKg: sz, buffer: Number(edit.buffer) || 0, shelfDays: Number(edit.shelfDays) || 0, main: !!edit.main && i === 0, active: true }))
      if (rows.some((r) => r.main)) products.filter((x) => x.main).forEach((x) => upsert('products', { ...x, main: false }))
      upsertMany('products', rows)
      setPid(rows[0].id)
      setEdit(null)
      toast(rows.length > 1 ? `${rows.length} products added` : `${rows[0].name} added`)
      return
    }
    const row = { id: edit.id || uid(), name, packetKg: Number(edit.packetKg) || 0, buffer: Number(edit.buffer) || 0, shelfDays: Number(edit.shelfDays) || 0, main: !!edit.main, active: true }
    if (row.main) products.filter((p) => p.main && p.id !== row.id).forEach((p) => upsert('products', { ...p, main: false }))
    upsert('products', row)
    setPid(row.id)
    setEdit(null)
    toast(`${name} saved`)
  }
  const removeProduct = () => {
    const p = data.products.find((x) => x.id === edit.id)
    if (p) upsert('products', { ...p, active: false })
    setPid('')
    setEdit(null)
    toast(`${edit.name} hidden (its stock history is kept)`)
  }
  const missing = PRESETS.filter((p) => !data.products.some((x) => x.active !== false && x.name.toLowerCase() === p.name.toLowerCase()))
  const addPreset = (p) => {
    if (data.products.some((x) => x.active !== false && x.name.toLowerCase() === p.name.toLowerCase())) return toast(`${p.name} is already added`, 'warn')
    const row = { id: uid(), ...p, active: true }
    upsert('products', row)
    setPid(row.id)
  }
  const pdf = async (share) => {
    setBusy(share ? 'share' : 'pdf')
    try {
      const [{ buildStockPdf }, { sharePdf }] = await Promise.all([import('../lib/stockPdf'), import('../lib/report')])
      const r0 = repRange()
      if (r0.from > r0.to) throw new Error('From date must be before To date')
      const { doc, filename } = await buildStockPdf({ products, from: r0.from, to: r0.to, data, title: `STOCK REPORT - ${r0.label}`, by: 'Admin' })
      if (share) {
        const r = await sharePdf(doc, filename, 'Agenic stock report')
        if (r === 'downloaded') toast('Sharing not supported here - PDF downloaded instead')
      } else {
        doc.save(filename)
        toast('Stock report downloaded')
      }
    } catch (e) {
      toast(e.message, 'bad')
    }
    setBusy('')
  }

  if (!product)
    return (
      <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
        <motion.div variants={rise}>
          <h2 className="h1">Stock</h2>
          <p className="muted">Date-wise production, dispatch and balance for every product.</p>
        </motion.div>
        <Empty icon="box" title="Add your first product" text="Tap the ones you sell (each pack size is tracked on its own), or add your own with several sizes at once.">
          <div className="row gap wrap" style={{ justifyContent: 'center' }}>
            {PRESETS.map((p) => (
              <button key={p.name} className="btn primary" onClick={() => addPreset(p)}>
                <Icon name="plus" size={16} /> {p.name}
              </button>
            ))}
            <button className="btn ghost" onClick={() => setEdit({ ...blankP })}>
              Other product
            </button>
          </div>
        </Empty>
        <ProductModal edit={edit} setEdit={setEdit} onSave={saveProduct} onRemove={removeProduct} />
      </motion.div>
    )

  const L = (k, v) => ({ label: k, v })
  const closeTone = preview.short > 0 ? 'neg' : ''
  return (
    <motion.div className="stack stock" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise} className="row between wrap">
        <div>
          <h2 className="h1">Stock</h2>
          <p className="muted">Made, sent and left over - day by day, oldest stock first.</p>
        </div>
        <DateNav future={1} />
      </motion.div>

      <StockLoginCard />
      <StockDashboard onPick={setPid} />

      <motion.div variants={rise} className="row gap wrap">
        {products.map((p) => (
          <button key={p.id} type="button" className={cx('chip-btn', p.id === product.id && 'on')} onClick={() => setPid(p.id)}>
            {p.name}
          </button>
        ))}
        {missing.map((p) => (
          <button key={p.name} type="button" className="chip-btn dashed" onClick={() => addPreset(p)}>
            <Icon name="plus" size={14} /> {p.name}
          </button>
        ))}
        <button type="button" className="chip-btn" onClick={() => setEdit({ ...blankP })}>
          <Icon name="plus" size={14} /> Other product
        </button>
        <button type="button" className="chip-btn" onClick={() => setEdit({ id: product.id, name: product.name, packetKg: String(product.packetKg || ''), buffer: String(product.buffer ?? 5), shelfDays: String(product.shelfDays || ''), main: !!product.main })}>
          <Icon name="edit" size={14} /> Edit {product.name}
        </button>
      </motion.div>

      {carry.carry.length > 0 && (
        <motion.section variants={rise} className="card pad clear-first">
          <h3 className="h3">
            <Icon name="alert" size={18} /> Clear this old stock first
          </h3>
          <div className="stock-batches">
            {carry.carry.map((b) => {
              const age = ageOf(b.date, date)
              const old = product.shelfDays && age >= product.shelfDays
              return (
                <div key={b.date} className={cx('batch', old && 'old')}>
                  <small>Made on {fmtDate(b.date, { weekday: 'short', day: 'numeric', month: 'short' })}</small>
                  <b>{kgt(b.kg)}</b>
                  <span>{packetText(b.kg, product) || ' '}</span>
                  <em>{age === 0 ? 'today' : `${age} day${age === 1 ? '' : 's'} old`}{old ? ' - past shelf life' : ''}</em>
                </div>
              )
            })}
          </div>
          <p className="muted">Total carried over: <b>{kgt(carry.opening)}</b>{packetText(carry.opening, product) ? ` (${packetText(carry.opening, product)})` : ''}. Dispatch uses this first.</p>
        </motion.section>
      )}

      <motion.section variants={rise} className="card pad">
        <div className="row between wrap">
          <h3 className="h3">Update for {date === todayStr() ? 'today' : fmtDate(date, { weekday: 'long', day: 'numeric', month: 'short' })}</h3>
          {pk > 0 && (
            <div className="seg">
              {[['kg', 'Kg'], ['pk', 'Packets']].map(([k, t]) => (
                <button key={k} type="button" className={cx(unit === k && 'on')} onClick={() => switchUnit(k)}>
                  {unit === k && <motion.i layoutId="stkunit" className="seg-pill" transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
                  <span>{t}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="form">
          <div className="stock-inputs">
            {[['produce', 'Produced today', 'new batch made'], ['dispatch', 'Sent out / sold', 'went to delivery'], ['waste', 'Wasted / discarded', 'spoiled or returned']].map(([k, t, h]) => (
              <Field key={k} label={`${t} (${unit === 'pk' ? 'packets' : 'kg'})`} hint={convText(f[k], unit, product) || h}>
                <input type="number" inputMode="decimal" min="0" step="any" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} placeholder="0" />
              </Field>
            ))}
          </div>
          {ordered > 0 && (
            <p className="muted">
              Orders entered in Daily Entry for this date: <b>{kgt(ordered)}</b>{' '}
              <button type="button" className="link" onClick={() => setF({ ...f, dispatch: unit === 'pk' && pk ? String(Math.round((ordered / pk) * 100) / 100) : String(ordered) })}>
                Use as sent out
              </button>
            </p>
          )}
          <Field label="Note (optional)">
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. 2 hotels cancelled" />
          </Field>
          <div className={cx('preview stock-prev', closeTone)}>
            <span>Opening <b>{kgt(preview.opening)}</b></span>
            <span>+ Made <b>{kgt(preview.produced)}</b></span>
            <span>- Sent <b>{kgt(preview.dispatched)}</b></span>
            <span>- Waste <b>{kgt(preview.waste)}</b></span>
            <span className="stock-close">= Left <b>{kgt(preview.closing)}</b>{packetText(preview.closing, product) ? ` · ${packetText(preview.closing, product)}` : ''}</span>
          </div>
          {preview.short > 0 && <p className="neg">Sent + waste is {kgt(preview.short)} more than the stock available. Check the produced kg.</p>}
          {preview.closingBatches.length > 0 && (
            <p className="muted">Left over from: {preview.closingBatches.map((b) => `${fmtDate(b.date, { day: 'numeric', month: 'short' })} - ${kgt(b.kg)}`).join('  |  ')}</p>
          )}
          <button className="btn primary" type="button" onClick={save}>
            <Icon name="check" size={18} /> Save stock
          </button>
        </div>
      </motion.section>

      <motion.section variants={rise} className="card pad suggest">
        <h3 className="h3">
          <Icon name="route" size={18} /> Make how much {date === todayStr() ? 'today' : `on ${fmtDate(date, { day: 'numeric', month: 'short' })}`}?
        </h3>
        <div className="suggest-big">
          <b>{kgt(sugToday.make)}</b>
          <span>{packetText(sugToday.make, product) || ' '}</span>
        </div>
        <p className="muted">
          {sugToday.source === 'none'
            ? 'Not enough history yet.'
            : `Daily need ${kgt(sugToday.demand)} ${sugToday.source === 'orders' ? '(orders entered)' : `(avg of last ${sugToday.samples} day${sugToday.samples === 1 ? '' : 's'})`}${sugToday.buffer ? ` + ${sugToday.buffer}% safety` : ''}, minus ${kgt(sugToday.carry)} old stock in hand.`}
        </p>
      </motion.section>

      <motion.section variants={rise} className="card pad suggest">
        <h3 className="h3">
          <Icon name="route" size={18} /> Make how much for {fmtDate(nextDay, { weekday: 'long', day: 'numeric', month: 'short' })}?
        </h3>
        <div className="suggest-big">
          <b>{kgt(sugNext.make)}</b>
          <span>{packetText(sugNext.make, product) || ' '}</span>
        </div>
        <p className="muted">
          {sugNext.source === 'none'
            ? 'Not enough history yet - enter a few days of dispatch and this will suggest the quantity.'
            : `Expected need ${kgt(sugNext.demand)} ${sugNext.source === 'orders' ? '(orders already entered)' : `(average of last ${sugNext.samples} day${sugNext.samples === 1 ? '' : 's'})`}${sugNext.buffer ? ` + ${sugNext.buffer}% safety = ${kgt(sugNext.target)}` : ''}, minus ${kgt(sugNext.carry)} already in hand.`}
        </p>
        {sugNext.expired > 0 && <p className="neg">{kgt(sugNext.expired)} of old stock will be past its shelf life - do not count on it.</p>}
        {sugNext.make === 0 && sugNext.source !== 'none' && <p className="pos">Enough stock already - no need to make more. This avoids wastage.</p>}
      </motion.section>

      <motion.section variants={rise} className="card pad">
        <div className="row between wrap">
          <h3 className="h3">Date-wise stock · {product.name}</h3>
          <div className="row gap wrap">
            <div className="seg">
              {[7, 14, 30].map((n) => (
                <button key={n} type="button" className={cx(span === n && 'on')} onClick={() => setSpan(n)}>
                  {span === n && <motion.i layoutId="stkspan" className="seg-pill" transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
                  <span>{n} days</span>
                </button>
              ))}
            </div>
            <select className="rep-sel" value={rep.mode} onChange={(e) => setRep({ ...rep, mode: e.target.value })} aria-label="Report period">
              <option value="span">Report: last {span} days</option>
              <option value="today">Report: today</option>
              <option value="week">Report: this week</option>
              <option value="custom">Report: custom dates</option>
            </select>
            {rep.mode === 'custom' && (
              <>
                <input type="date" value={rep.from} max={todayStr()} onChange={(e) => setRep({ ...rep, from: e.target.value })} />
                <input type="date" value={rep.to} max={todayStr()} onChange={(e) => setRep({ ...rep, to: e.target.value })} />
              </>
            )}
            <button className="btn ghost sm" disabled={!!busy} onClick={() => pdf(false)}>
              <Icon name="download" size={15} /> {busy === 'pdf' ? '…' : 'PDF'}
            </button>
            <button className="btn ghost sm" disabled={!!busy} onClick={() => pdf(true)}>
              <Icon name="mail" size={15} /> Share
            </button>
          </div>
        </div>
        {!history.length ? (
          <p className="muted">No entries yet.</p>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Carried</th>
                  <th>Made</th>
                  <th>Sent</th>
                  <th>Waste</th>
                  <th>Left</th>
                  <th>From stock of</th>
                </tr>
              </thead>
              <tbody>
                {history.map((d) => (
                  <tr key={d.date}>
                    <td>{fmtDate(d.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td>
                    <td>{kgt(d.opening)}</td>
                    <td className="pos">{d.produced ? kgt(d.produced) : '-'}</td>
                    <td>{d.dispatched ? kgt(d.dispatched) : '-'}</td>
                    <td className={d.waste ? 'neg' : ''}>{d.waste ? kgt(d.waste) : '-'}</td>
                    <td><b>{kgt(d.closing)}</b>{packets(d.closing, product) != null && d.closing > 0 ? <small> {packetText(d.closing, product)}</small> : null}</td>
                    <td><small>{d.alloc.filter((a) => a.type === 'dispatch').map((a) => `${fmtDate(a.batchDate, { day: 'numeric', month: 'short' })}: ${kgt(a.kg)}`).join(', ') || '-'}</small></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.section>

      <ProductModal edit={edit} setEdit={setEdit} onSave={saveProduct} onRemove={removeProduct} />
    </motion.div>
  )
}

function ProductModal({ edit, setEdit, onSave, onRemove }) {
  return (
    <Modal open={!!edit} onClose={() => setEdit(null)}>
      {edit && (
        <div className="form">
          <h3 className="h3">{edit.id ? 'Edit product' : 'Add product'}</h3>
          <Field label="Product name">
            <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="e.g. Sridhi plain packets" />
          </Field>
          <div className="two">
            {edit.id ? (
              <Field label="Packet size (kg)" hint="1 packet = how many kg. 0 = not sold in packets">
                <input type="number" inputMode="decimal" min="0" step="any" value={edit.packetKg} onChange={(e) => setEdit({ ...edit, packetKg: e.target.value })} />
              </Field>
            ) : (
              <Field label="Packet sizes (kg)" hint="e.g. 1, 5 makes a separate stock line for each size. Leave empty for loose kg">
                <input value={edit.sizes} onChange={(e) => setEdit({ ...edit, sizes: e.target.value })} placeholder="1, 5" />
              </Field>
            )}
            <Field label="Safety extra (%)" hint="Added on top when suggesting production">
              <input type="number" inputMode="decimal" min="0" value={edit.buffer} onChange={(e) => setEdit({ ...edit, buffer: e.target.value })} />
            </Field>
          </div>
          <Field label="Shelf life (days)" hint="Old stock past this is flagged. 0 = no limit">
            <input type="number" inputMode="numeric" min="0" value={edit.shelfDays} onChange={(e) => setEdit({ ...edit, shelfDays: e.target.value })} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={edit.main} onChange={(e) => setEdit({ ...edit, main: e.target.checked })} /> This is the batter sold to hotels (use Daily Entry orders for suggestions)
          </label>
          <div className="modal-actions">
            {edit.id && (
              <button className="btn ghost" type="button" onClick={onRemove}>Hide product</button>
            )}
            <button className="btn ghost" type="button" onClick={() => setEdit(null)}>Cancel</button>
            <button className="btn primary" type="button" onClick={onSave}>Save product</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
