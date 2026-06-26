/**
 * Lightweight i18n engine for the AYC PWA.
 *
 * Mirrors the react-i18next API used in the ERP frontend so both apps share
 * the same usage pattern: useTranslation(namespace) → { t }.
 *
 * Why not react-i18next here?
 *   The PWA is a single-language kiosk (always English). Language detection,
 *   pluralisation rules, and React context overhead are unnecessary. This
 *   module provides the same surface with zero extra dependencies.
 *
 * Structure (mirrors frontend src/i18n/):
 *   pwa/src/i18n/
 *     index.js                   ← this file
 *     locales/
 *       en/
 *         common.json            ← shared labels (loading, errors, shared UI)
 *         home.json              ← HomeScreen labels
 *         {journey}.json         ← one file per journey as they are built
 *
 * Adding a new namespace (e.g. for the wifi journey):
 *   1. Create pwa/src/i18n/locales/en/wifi.json
 *   2. import enWifi from './locales/en/wifi.json'
 *   3. addTranslations('en', 'wifi', enWifi)  ← in main.jsx
 *   4. In component: const { t } = useTranslation('wifi')
 *
 * DO NOT regenerate this file. Contact Rushiraj if behaviour must change.
 */

/** Internal registry — lang → namespace → translations object */
const registry = {}

/**
 * Register a JSON translations object for a language + namespace.
 * Call once per locale file, at app startup in main.jsx.
 *
 * @param {string} lang         e.g. 'en'
 * @param {string} namespace    e.g. 'home', 'common'
 * @param {object} translations Imported JSON object
 */
export const addTranslations = (lang, namespace, translations) => {
  if (!registry[lang]) registry[lang] = {}
  registry[lang][namespace] = translations
}

/**
 * Resolve a dotted key within a namespace.
 * Supports {{variable}} interpolation.
 *
 * @param {string} namespace
 * @param {string} key        Dot-separated path, e.g. 'cta.menu'
 * @param {object} [vars]     Interpolation variables, e.g. { name: 'Dubai' }
 * @param {string} [lang]
 * @returns {string}          Resolved string, or the key itself if not found
 */
const resolve = (namespace, key, vars = {}, lang = 'en') => {
  const parts = key.split('.')
  let node    = registry[lang]?.[namespace]
  for (const part of parts) {
    if (node == null) return key
    node = node[part]
  }
  if (typeof node !== 'string') return key
  return node.replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars[k] ?? `{{${k}}}`))
}

/**
 * React hook — same signature as react-i18next's useTranslation.
 *
 * @param {string} namespace
 * @returns {{ t: (key: string, vars?: object) => string }}
 *
 * @example
 *   const { t } = useTranslation('home')
 *   t('cta.menu')                         // → 'Menu'
 *   t('hero.welcome_to', { name: 'AYC' }) // → 'Welcome to AYC'
 */
export const useTranslation = (namespace) => ({
  t: (key, vars) => resolve(namespace, key, vars),
})
