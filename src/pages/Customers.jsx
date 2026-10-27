import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useApp } from '../store'
import { cx, fmtDate, inr, uid } from '../lib/util'
import { customersFromRows, customersFromText, mapUrl, rowsFromXlsx, TEMPLATE } from '../lib/csv'
import { Empty, Field, Icon, Modal, Num, rise, Ring, stagger, StatusChip, Tilt } from '../components/ui'

const blank = { id: null, name: '', area: '', address: '', phone: '', email: '', rate: '', creditLimit: '', maxDays: '', active: true }

export default function Customers() {
  const { data, dues, upsert, upsertMany, sendReminder, toast } = useApp()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [edit, setEdit] = useState(null)
  const [busy, setBusy] = useState({})
  const [imp, setImp] = useState(null) // { text } while the import dialog is open
  const parsed = imp
    ? imp.sheet
      ? customersFromRows(imp.sheet, { rate: data.settings.defaultRate })
      : customersFromText(imp.text, { rate: data.settings.defaultRate })
    : null

  const readFile = async (file) => {
    if (!file) return
    try {
      if (/\.xlsx$/i.test(file.name)) setImp({ text: '', sheet: await rowsFromXlsx(file), name: file.name })
      else setImp({ text: await file.text(), name: file.name })
    } catch (e) {
      toast(`Could not read that file: ${e.message}`, 'bad')
    }
  }
  const downloadTemplate = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' }))
    a.download = 'agenic-customers-template.csv'
    a.click()
    URL.revokeObjectURL(a.href)
  }
  const runImport = () => {
    // match an existing customer by phone first (names can repeat), then by name
    const byPhone = new Map(data.customers.filter((c) => c.phone).map((c) => [String(c.phone), c]))
    const byName = new Map(data.customers.map((c) => [c.name.trim().toLowerCase(), c]))
    let added = 0
    let updated = 0
    const rows = parsed.rows.map((r) => {
      const hit = (r.phone && byPhone.get(r.phone)) || (!r.phone && byName.get(r.name.toLowerCase()))
      hit ? updated++ : added++
      return { ...r, id: hit?.id || uid() }
    })
    upsertMany('customers', rows)
    toast(`Imported ${added} new, ${updated} updated`)
    setImp(null)
  }

  const rows = dues.filter((d) => {
    if (q && !`${d.customer.name} ${d.customer.area}`.toLowerCase().includes(q.toLowerCase())) return false
    if (filter === 'breach') return d.status === 'breach'
    if (filter === 'due') return d.outstanding > 0
    if (filter === 'clear') return d.outstanding <= 0
    return true
  })
  const inactive = data.customers.filter((c) => c.active === false)

  const remind = async (d) => {
    setBusy((b) => ({ ...b, [d.customer.id]: true }))
    await sendReminder(d)
    setBusy((b) => ({ ...b, [d.customer.id]: false }))
  }
  const save = (e) => {
    e.preventDefault()
    if (!edit.name.trim() || !Number(edit.rate)) return toast('Name and rate are required', 'warn')
    upsert('customers', {
      id: edit.id || uid(),
      name: edit.name.trim(),
      area: edit.area.trim(),
      address: (edit.address || '').trim(),
      mapUrl: mapUrl((edit.address || '').trim()),
      phone: edit.phone.trim(),
      email: edit.email.trim(),
      rate: Number(edit.rate),
      creditLimit: Number(edit.creditLimit) || 0,
      maxDays: Number(edit.maxDays) || 0,
      active: edit.active
    })
    toast(edit.id ? 'Customer updated' : 'Customer added')
    setEdit(null)
  }
  const open = (c) =>
    setEdit(c ? { ...blank, ...c, rate: c.rate, creditLimit: c.creditLimit || '', maxDays: c.maxDays || '' } : { ...blank, rate: data.settings.defaultRate, maxDays: data.settings.maxUnpaidDays })

  return (
    <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise} className="row between wrap">
        <div>
          <h2 className="h1">Customers</h2>
          <p className="muted">Credit limits, dues and reminders for your hotels.</p>
        </div>
        <div className="row gap">
          <button className="btn ghost" onClick={() => setImp({ text: '' })}>
            <Icon name="download" size={18} /> Import
          </button>
          <button className="btn primary" onClick={() => open(null)}>
            <Icon name="plus" size={18} /> Add customer
          </button>
        </div>
      </motion.div>

      <motion.div variants={rise} className="row gap wrap toolbar">
        <label className="search">
          <Icon name="search" size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hotel or area" />
        </label>
        <div className="seg">
          {[
            ['all', 'All'],
            ['breach', 'Over limit'],
            ['due', 'Has dues'],
            ['clear', 'Clear']
          ].map(([k, l]) => (
            <button key={k} className={cx(filter === k && 'on')} onClick={() => setFilter(k)}>
              {filter === k && <motion.i layoutId="seg" className="seg-pill" />}
              <span>{l}</span>
            </button>
          ))}
        </div>
      </motion.div>

      <motion.div className="cards" variants={stagger}>
        <AnimatePresence mode="popLayout">
          {rows.map((d) => {
            const c = d.customer
            const tone = d.status === 'breach' ? 'bad' : d.status === 'warn' ? 'warn' : 'ok'
            const reminded = data.reminders?.[c.id]
            return (
              <Tilt key={c.id} variants={rise} layout exit={{ opacity: 0, scale: 0.9 }} className={cx('ccard', d.status)} strength={5}>
                {d.status === 'breach' && <i className="pulse-ring" />}
                <div className="row between">
                  <div className="row gap">
                    <div className={cx('avatar', tone)}>{c.name[0]}</div>
                    <div>
                      <b className="cname">{c.name}</b>
                      <small className="muted">{c.area || '—'} · {inr(c.rate)}/kg</small>
                    </div>
                  </div>
                  <StatusChip status={d.status} />
                </div>

                <div className="cmid">
                  <div>
                    <small>Outstanding</small>
                    <b className={cx('cbig', d.outstanding > 0 && tone)}>
                      <Num value={d.outstanding} duration={0.9} />
                    </b>
                    <small className="muted">
                      {d.outstanding > 0 ? `oldest bill ${fmtDate(d.oldest)} · ${d.daysUnpaid}d` : d.advance > 0 ? `advance ${inr(d.advance)}` : 'nothing pending'}
                    </small>
                  </div>
                  {d.limit > 0 ? (
                    <Ring value={d.usage} status={tone}>
                      <b>{Math.round(d.usage * 100)}%</b>
                      <small>of limit</small>
                    </Ring>
                  ) : (
                    <div className="nolimit">No limit</div>
                  )}
                </div>

                <div className="limits">
                  <span>Limit {d.limit ? inr(d.limit) : '—'}</span>
                  <span>Max {d.maxDays || '—'} days</span>
                  <span>Billed {inr(d.billed)}</span>
                </div>
                {d.reasons.length > 0 && (
                  <div className="reasons">
                    {d.reasons.map((r) => (
                      <p key={r}>
                        <Icon name="alert" size={14} /> {r}
                      </p>
                    ))}
                  </div>
                )}

                <div className="row gap">
                  <button className="btn ghost sm grow" disabled={d.outstanding <= 0 || busy[c.id]} onClick={() => remind(d)}>
                    <Icon name="mail" size={15} /> {busy[c.id] ? 'Sending…' : reminded ? 'Remind again' : 'Send reminder'}
                  </button>
                  {c.mapUrl && (
                    <a className="icon-btn" href={c.mapUrl} target="_blank" rel="noreferrer" aria-label="Open in Google Maps" title="Open in Google Maps">
                      <Icon name="pin" size={16} />
                    </a>
                  )}
                  {c.phone && (
                    <a className="icon-btn" href={`tel:${c.phone}`} aria-label="Call" title={`Call ${c.phone}`}>
                      <Icon name="phone" size={16} />
                    </a>
                  )}
                  <button className="icon-btn" onClick={() => open(c)} aria-label="Edit customer">
                    <Icon name="edit" size={16} />
                  </button>
                </div>
                {reminded && <small className="muted tiny">Last reminder {new Date(reminded).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</small>}
              </Tilt>
            )
          })}
        </AnimatePresence>
      </motion.div>
      {data.customers.length === 0 ? (
        <Empty icon="users" title="No customers yet" text="Import all your hotels at once from a CSV or Excel sheet, or add them one by one.">
          <button className="btn primary" onClick={() => setImp({ text: '' })}>
            <Icon name="download" size={18} /> Bulk import customers
          </button>
        </Empty>
      ) : (
        rows.length === 0 && <Empty icon="users" title="No customers match" text="Try another search or filter." />
      )}
      {inactive.length > 0 && <p className="muted tiny">{inactive.length} inactive customer(s) hidden.</p>}

      <Modal open={!!imp} onClose={() => setImp(null)} wide>
        {imp && (
          <div className="form">
            <div className="row between">
              <h3 className="h3">
                <Icon name="download" size={18} /> Bulk import customers
              </h3>
              <button type="button" className="icon-btn" onClick={() => setImp(null)} aria-label="Close">
                <Icon name="x" size={18} />
              </button>
            </div>
            <p className="muted">
              Upload an <b>Excel (.xlsx)</b> or CSV file, or paste cells copied from Excel / Google Sheets. First row = headers, e.g.{' '}
              <b>Customer Name, Phone Number, Location</b> (also: area, email, rate, creditLimit, maxDays). A price in the name like “price 32” becomes the rate. Re-importing updates customers (matched by phone) instead of duplicating.
            </p>
            <div className="row gap wrap">
              <label className="btn ghost sm">
                Choose Excel / CSV file
                <input type="file" accept=".xlsx,.csv,.txt,text/csv" hidden onChange={(e) => readFile(e.target.files?.[0])} />
              </label>
              <button type="button" className="btn ghost sm" onClick={downloadTemplate}>
                Download template
              </button>
              {imp.name && <small className="muted">{imp.name}</small>}
            </div>
            <textarea
              className="paste"
              rows={6}
              value={imp.text}
              onChange={(e) => setImp({ text: e.target.value })}
              disabled={!!imp.sheet}
              placeholder={'name\tarea\tphone\temail\trate\tcreditLimit\tmaxDays'}
            />
            {(imp.text.trim() || imp.sheet) && (
              <div className={cx('preview', parsed.rows.length ? '' : 'solid')}>
                <span>
                  <b>{parsed.rows.length}</b> customer{parsed.rows.length === 1 ? '' : 's'} ready
                  {parsed.rows.length > 0 && ` · first: ${parsed.rows[0].name}`}
                </span>
                {parsed.errors.length > 0 && <span className="warn">{parsed.errors[0]}{parsed.errors.length > 1 ? ` (+${parsed.errors.length - 1} more)` : ''}</span>}
              </div>
            )}
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setImp(null)}>
                Cancel
              </button>
              <button type="button" className="btn primary" disabled={!parsed?.rows.length} onClick={runImport}>
                <Icon name="check" size={18} /> Import {parsed?.rows.length || ''}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal open={!!edit} onClose={() => setEdit(null)}>
        {edit && (
          <form onSubmit={save} className="form">
            <div className="row between">
              <h3 className="h3">{edit.id ? 'Edit customer' : 'New customer'}</h3>
              <button type="button" className="icon-btn" onClick={() => setEdit(null)} aria-label="Close">
                <Icon name="x" size={18} />
              </button>
            </div>
            <Field label="Hotel / business name">
              <input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </Field>
            <div className="two">
              <Field label="Area">
                <input value={edit.area} onChange={(e) => setEdit({ ...edit, area: e.target.value })} />
              </Field>
              <Field label="Phone">
                <input inputMode="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              </Field>
            </div>
            <Field label="Address / location (for Google Maps)">
              <input value={edit.address || ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} />
            </Field>
            <Field label="Email (for payment reminders)">
              <input type="email" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
            </Field>
            <div className="three">
              <Field label="Rate / kg (₹)">
                <input type="number" inputMode="decimal" value={edit.rate} onChange={(e) => setEdit({ ...edit, rate: e.target.value })} />
              </Field>
              <Field label="Credit limit (₹)" hint="0 = no limit">
                <input type="number" inputMode="decimal" value={edit.creditLimit} onChange={(e) => setEdit({ ...edit, creditLimit: e.target.value })} />
              </Field>
              <Field label="Max unpaid days" hint="oldest bill age">
                <input type="number" inputMode="numeric" value={edit.maxDays} onChange={(e) => setEdit({ ...edit, maxDays: e.target.value })} />
              </Field>
            </div>
            <label className="switch">
              <input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
              <i />
              <span>Active customer</span>
            </label>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button>
              <button type="submit" className="btn primary">
                <Icon name="check" size={18} /> Save
              </button>
            </div>
          </form>
        )}
      </Modal>
    </motion.div>
  )
}
