import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AppProvider, useApp } from './store'
import { Background, Icon, Toasts } from './components/ui'
import AlertPopup from './components/AlertPopup'
import Dashboard from './pages/Dashboard'
import Entry from './pages/Entry'
import Payments from './pages/Payments'
import Customers from './pages/Customers'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import { cx } from './lib/util'

const TABS = [
  { id: 'dash', label: 'Dashboard', icon: 'dash', page: Dashboard },
  { id: 'entry', label: 'Daily Entry', icon: 'truck', page: Entry },
  { id: 'pay', label: 'Payments', icon: 'wallet', page: Payments },
  { id: 'cust', label: 'Customers', icon: 'users', page: Customers },
  { id: 'rep', label: 'Reports', icon: 'chart', page: Reports },
  { id: 'set', label: 'Settings', icon: 'gear', page: Settings }
]

function Splash() {
  return (
    <motion.div
      className="splash"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 1.08 }}
      transition={{ duration: 0.55 }}
    >
      <motion.div
        className="splash-logo"
        initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 12, stiffness: 140 }}
      >
        A
      </motion.div>
      <motion.h1 initial={{ y: 16, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.25 }}>
        Agenic
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        Batter Ledger
      </motion.p>
      <div className="splash-bar">
        <motion.i initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 1.1, ease: 'easeInOut' }} />
      </div>
    </motion.div>
  )
}

function SyncBadge() {
  const { sync, syncError, pull } = useApp()
  const map = {
    demo: ['Not connected', 'warn'],
    syncing: ['Syncing…', 'info'],
    synced: ['Synced to Sheet', 'ok'],
    offline: ['Offline - will retry', 'bad']
  }
  const [label, tone] = map[sync]
  return (
    <button className={cx('sync', tone)} onClick={pull} title={syncError || 'Tap to refresh'}>
      <i className="dot" /> {label}
    </button>
  )
}

function Shell() {
  const { tab, setTab, breaches, setPopup, data } = useApp()
  const [splash, setSplash] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setSplash(false), 1300)
    return () => clearTimeout(t)
  }, [])
  const Page = TABS.find((t) => t.id === tab).page

  return (
    <>
      <Background />
      <AnimatePresence>{splash && <Splash key="splash" />}</AnimatePresence>

      <div className="app">
        <aside className="side">
          <div className="brand">
            <div className="brand-mark">A</div>
            <div>
              <b>{data.settings.company || 'Agenic'}</b>
              <small>Batter Ledger</small>
            </div>
          </div>
          <nav>
            {TABS.map((t) => (
              <button key={t.id} className={cx('nav-item', tab === t.id && 'on')} onClick={() => setTab(t.id)}>
                {tab === t.id && <motion.i layoutId="navpill" className="nav-pill" transition={{ type: 'spring', damping: 26, stiffness: 320 }} />}
                <Icon name={t.icon} />
                <span>{t.label}</span>
                {t.id === 'cust' && breaches.length > 0 && <em className="badge">{breaches.length}</em>}
              </button>
            ))}
          </nav>
          <SyncBadge />
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="brand sm">
              <div className="brand-mark">A</div>
              <b>{TABS.find((t) => t.id === tab).label}</b>
            </div>
            <SyncBadge />
          </header>

          <AnimatePresence>
            {breaches.length > 0 && (
              <motion.button
                key="warnbar"
                className="warnbar"
                onClick={() => setPopup(true)}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
              >
                <span className="warn-ic">
                  <Icon name="alert" size={18} />
                </span>
                <span>
                  <b>{breaches.length} customer{breaches.length > 1 ? 's have' : ' has'} crossed the payment limit.</b>{' '}
                  Tap to review and send reminders.
                </span>
                <Icon name="right" size={18} />
              </motion.button>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={tab}
              className="page"
              initial={{ opacity: 0, y: 18, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={{ duration: 0.28 }}
            >
              <Page />
            </motion.div>
          </AnimatePresence>
        </main>

        <nav className="bottom">
          {TABS.map((t) => (
            <button key={t.id} className={cx('b-item', tab === t.id && 'on')} onClick={() => setTab(t.id)}>
              <span className="b-ic">
                {tab === t.id && <motion.i layoutId="bpill" className="b-pill" transition={{ type: 'spring', damping: 24, stiffness: 340 }} />}
                <Icon name={t.icon} size={21} />
                {t.id === 'cust' && breaches.length > 0 && <em className="badge">{breaches.length}</em>}
              </span>
              <small>{t.label.split(' ').pop()}</small>
            </button>
          ))}
        </nav>
      </div>

      <AlertPopup />
      <Toasts />
    </>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
