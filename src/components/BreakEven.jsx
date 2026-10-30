import { motion } from 'framer-motion'
import { useApp } from '../store'
import { cx, inr, kgf } from '../lib/util'
import { Num, rise } from './ui'

/** How many kg must be sold just to cover the day's expenses, and how much of today's kg is real profit. */
export default function BreakEven({ s }) {
  const { data } = useApp()
  const st = data.settings
  const withProfit = data.customers.filter((c) => Number(c.profitPerKg) > 0)
  const guess = Number(st.defaultProfitPerKg) || (withProfit.length ? withProfit.reduce((a, c) => a + Number(c.profitPerKg), 0) / withProfit.length : 0)
  const ppk = s.marginPerKg > 0 ? s.marginPerKg : guess
  const exp = s.logistics
  if (!(exp > 0) || !(ppk > 0)) {
    return (
      <motion.div variants={rise} className="be be-wait">
        <b>Break-even</b>
        <span>{exp > 0 ? 'Set your profit per kg (Customers → Rates & profit) to see how many kg cover the expenses.' : 'Enter the driver, diesel or hired vehicle cost to see how many kg are needed to cover today\'s expenses.'}</span>
      </motion.div>
    )
  }
  const need = exp / ppk
  const sold = s.kg
  const pct = Math.min(1, sold / need)
  const over = Math.max(0, sold - need)
  const short = Math.max(0, need - sold)
  const ok = sold >= need
  return (
    <motion.div variants={rise} className={cx('be', ok ? 'ok' : 'low')}>
      <div className="be-head">
        <div>
          <small>Break-even for today's expenses</small>
          <h4>
            <Num value={Math.ceil(need)} format={(v) => `${Math.round(v)} kg`} duration={0.9} /> <em className="be-sub">covers {inr(exp)} of expenses</em>
          </h4>
        </div>
        <span className="be-tag">{ok ? 'EXPENSES COVERED' : 'NOT YET COVERED'}</span>
      </div>
      <div className="be-track" role="progressbar" aria-valuenow={Math.round(pct * 100)}>
        <motion.i initial={{ width: 0 }} animate={{ width: `${pct * 100}%` }} transition={{ duration: 1, ease: [0.2, 0.8, 0.2, 1] }} />
        <u style={{ left: '100%' }} />
      </div>
      <div className="be-row">
        <span>Sold <b>{kgf(sold)}</b></span>
        <span>Profit <b>{inr(ppk)}/kg</b>{s.marginPerKg > 0 ? '' : ' (estimate)'}</span>
        <span>Expenses <b>{inr(exp)}</b> <small>(driver {inr(s.driver)}, diesel {inr(s.diesel)}, hired {inr(s.porter)}, other {inr(s.other)})</small></span>
      </div>
      <p className="be-msg">
        {ok
          ? <>The first <b>{kgf(Math.ceil(need))}</b> pay for the expenses. The other <b>{kgf(Math.round(over * 10) / 10)}</b> is pure profit: <b className="pos">{inr(over * ppk)}</b>.</>
          : <>Sell <b>{kgf(Math.ceil(short))}</b> more to cover the expenses. Until then the day shows a loss of <b className="neg">{inr(short * ppk)}</b>.</>}
      </p>
    </motion.div>
  )
}
