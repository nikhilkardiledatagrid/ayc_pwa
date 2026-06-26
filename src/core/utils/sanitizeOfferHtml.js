/**
 * sanitizeOfferHtml
 *
 * Minimal allowlist sanitizer for the admin-authored Exclusive Offer copy
 * (top/middle/bottom rich-text lines). The PWA has no DOMPurify dependency, so
 * this walks the parsed DOM and keeps only a small set of inline formatting
 * tags plus a `color` style — everything else (scripts, handlers, other tags
 * and attributes) is dropped. Returns a string safe for dangerouslySetInnerHTML.
 */

const ALLOWED_TAGS = new Set(['P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'SPAN', 'FONT'])

/** Keep only `color: <value>` from a style string. */
const safeColorStyle = (style) => {
  const match = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style || '')
  if (!match) return ''
  const value = match[1].trim()
  // Allow hex / rgb / rgba / named colours; reject anything with url() or expressions.
  if (/^(#[0-9a-f]{3,8}|rgb\([^)]*\)|rgba\([^)]*\)|[a-z]+)$/i.test(value)) {
    return value
  }
  return ''
}

const clean = (node, doc) => {
  // Element nodes only; drop comments etc.
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === 1) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Unwrap disallowed elements: keep their (cleaned) text/children.
        clean(child, doc)
        while (child.firstChild) node.insertBefore(child.firstChild, child)
        node.removeChild(child)
        continue
      }
      // Strip every attribute except a sanitized color.
      const color = child.tagName === 'FONT'
        ? (child.getAttribute('color') || '')
        : safeColorStyle(child.getAttribute('style'))
      for (const attr of Array.from(child.attributes)) child.removeAttribute(attr.name)
      if (color) {
        if (child.tagName === 'FONT') child.setAttribute('color', color)
        else child.setAttribute('style', `color: ${color}`)
      }
      clean(child, doc)
    } else if (child.nodeType !== 3) {
      node.removeChild(child)
    }
  }
}

export const sanitizeOfferHtml = (html) => {
  if (!html || typeof html !== 'string') return ''
  try {
    const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
    const root = doc.body.firstChild
    if (!root) return ''
    clean(root, doc)
    return root.innerHTML
  } catch {
    return ''
  }
}

/** Shaped for dangerouslySetInnerHTML. */
export const renderSafeOfferHtml = (html) => ({ __html: sanitizeOfferHtml(html) })
