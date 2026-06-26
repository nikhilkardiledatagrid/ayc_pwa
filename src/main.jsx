import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { QueryClientProvider } from '@tanstack/react-query'
import store from './core/store'
import queryClient from './lib/queryClient'
import { addTranslations } from './i18n/index'
import './index.css'
import './fonts.css'
import App from './App.jsx'

// ── Register i18n locale files ────────────────────────────────────────────────
// One import + addTranslations() call per JSON file.
// Adding a new journey? Create locales/en/{journey}.json and register it here.
import enCommon         from './i18n/locales/en/common.json'
import enHome           from './i18n/locales/en/home.json'
import enDeviceSetup    from './i18n/locales/en/device-setup.json'
import enDeviceReconfig from './i18n/locales/en/device-reconfig.json'
import enWifi           from './i18n/locales/en/wifi.json'
import enMenu           from './i18n/locales/en/menu.json'
import enReview         from './i18n/locales/en/review.json'
import enLead           from './i18n/locales/en/lead.json'
import enWaiter         from './i18n/locales/en/waiter.json'
import enCart           from './i18n/locales/en/cart.json'
import enLoyalty        from './i18n/locales/en/loyalty.json'
import enGames          from './i18n/locales/en/games.json'
import enStoreClosed    from './i18n/locales/en/store-closed.json'

addTranslations('en', 'common',          enCommon)
addTranslations('en', 'home',            enHome)
addTranslations('en', 'device-setup',    enDeviceSetup)
addTranslations('en', 'device-reconfig', enDeviceReconfig)
addTranslations('en', 'wifi',            enWifi)
addTranslations('en', 'menu',            enMenu)
addTranslations('en', 'review',          enReview)
addTranslations('en', 'lead',            enLead)
addTranslations('en', 'waiter',          enWaiter)
addTranslations('en', 'cart',            enCart)
addTranslations('en', 'loyalty',         enLoyalty)
addTranslations('en', 'games',           enGames)
addTranslations('en', 'store-closed',    enStoreClosed)
// ─────────────────────────────────────────────────────────────────────────────

createRoot(document.getElementById('root')).render(
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </Provider>,
)
