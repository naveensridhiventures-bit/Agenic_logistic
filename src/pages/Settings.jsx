import { useState } from 'react'
import { motion } from 'framer-motion'
import { useApp } from '../store'
import * as api from '../lib/api'
import { Field, Icon, rise, stagger } from '../components/ui'

export default function Settings() {
  const { data, saveSettings, toast, live, sync, syncError, pull } = useApp()
  const [s, setS] = useState({ ...data.settings })
  const [cfg, setCfg] = useState(api.getCfg())
  const [testing, setTesting] = useState(false)
  const set = (k, v) => setS((p) => ({ ...p, [k]: v }))

  const save = (e) => {
    e.preventDefault()
    saveSettings({
      ...s,
      costPerKg: Number(s.costPerKg) || 0,
      defaultRate: Number(s.defaultRate) || 0,
      driverPerDay: Number(s.driverPerDay) || 0,
      maxUnpaidDays: Number(s.maxUnpaidDays) || 0,
      warnPercent: Number(s.warnPercent) || 80
    })
    toast('Settings saved')
  }
  const test = async () => {
    setTesting(true)
    try {
      const d = await api.getAll(cfg)
      toast(`Connected - ${d.customers?.length || 0} customers found`)
    } catch (e) {
      toast(e.message, 'bad')
    }
    setTesting(false)
  }
  const connect = () => {
    api.setCfg(cfg)
    toast('Saved. Reloading…')
    setTimeout(() => location.reload(), 600)
  }

  return (
    <motion.div className="stack" variants={stagger} initial="hidden" animate="show">
      <motion.div variants={rise}>
        <h2 className="h1">Settings</h2>
        <p className="muted">Batter cost, alert rules and your Google Sheet connection.</p>
      </motion.div>

      <div className="grid2 top">
        <motion.form variants={rise} className="card pad form" onSubmit={save}>
          <h3 className="h3"><Icon name="gear" size={18} /> Business</h3>
          <Field label="Company name">
            <input value={s.company} onChange={(e) => set('company', e.target.value)} />
          </Field>
          <div className="two">
            <Field label="Batter cost per kg (₹)" hint="Your making cost - used for profit">
              <input type="number" inputMode="decimal" value={s.costPerKg} onChange={(e) => set('costPerKg', e.target.value)} />
            </Field>
            <Field label="Default selling rate (₹/kg)">
              <input type="number" inputMode="decimal" value={s.defaultRate} onChange={(e) => set('defaultRate', e.target.value)} />
            </Field>
          </div>
          <Field label="Driver salary per day (₹)" hint="Pre-filled on each day's entry">
            <input type="number" inputMode="decimal" value={s.driverPerDay} onChange={(e) => set('driverPerDay', e.target.value)} />
          </Field>
          <h3 className="h3 mt"><Icon name="bell" size={18} /> Payment alerts</h3>
          <div className="two">
            <Field label="Default max unpaid days" hint="Alert when oldest bill is this old">
              <input type="number" inputMode="numeric" value={s.maxUnpaidDays} onChange={(e) => set('maxUnpaidDays', e.target.value)} />
            </Field>
            <Field label="'Near limit' at (%)" hint="Early yellow warning">
              <input type="number" inputMode="numeric" value={s.warnPercent} onChange={(e) => set('warnPercent', e.target.value)} />
            </Field>
          </div>
          <Field label="Your email (gets a copy of reminders + daily summary)">
            <input type="email" value={s.ownerEmail} onChange={(e) => set('ownerEmail', e.target.value)} />
          </Field>
          <button className="btn primary" type="submit">
            <Icon name="check" size={18} /> Save settings
          </button>
          <small className="muted">Credit limit and max days can also be set per customer.</small>
        </motion.form>

        <motion.section variants={rise} className="card pad form">
          <h3 className="h3"><Icon name="cloud" size={18} /> Google Sheet backend</h3>
          <div className={`status-box ${live ? (sync === 'offline' ? 'bad' : 'ok') : 'warn'}`}>
            <i className="dot" />
            <div>
              <b>{live ? (sync === 'offline' ? 'Backend not reachable' : 'Connected to your Google Sheet') : 'Not connected'}</b>
              <small>{live ? syncError || 'Every change is saved to the sheet automatically.' : 'Nothing is saved to a sheet until you add the web app URL.'}</small>
            </div>
          </div>
          <Field label="Web app URL" hint="From Apps Script: Deploy → Web app">
            <input value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value.trim() })} placeholder="https://script.google.com/macros/s/…/exec" />
          </Field>
          <Field label="Secret key" hint="Same value as API_KEY in Code.gs">
            <input type="password" value={cfg.key} onChange={(e) => setCfg({ ...cfg, key: e.target.value })} placeholder="your key" />
          </Field>
          <div className="row gap">
            <button className="btn ghost grow" onClick={test} disabled={!cfg.url || testing}>
              {testing ? 'Testing…' : 'Test connection'}
            </button>
            <button className="btn primary grow" onClick={connect} disabled={!cfg.url}>
              Save &amp; connect
            </button>
          </div>
          {live && (
            <button className="btn ghost" onClick={pull}>
              <Icon name="cloud" size={16} /> Sync now
            </button>
          )}
          <small className="muted">
            Tip: on your phone use the browser menu → “Install app” / “Add to Home Screen” to get Agenic as an app.
          </small>
        </motion.section>
      </div>
    </motion.div>
  )
}
