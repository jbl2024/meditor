/**
 * Builds the standalone HTML document used by the file inspector preview iframe.
 *
 * The iframe content must stay free of inline style/script tags because the
 * production CSP inherited by local schemes blocks them.
 */
export type PreviewThemeSnapshot = {
  colorScheme: 'light' | 'dark'
  vars: Record<string, string>
}

export type PreviewDocumentAssets = {
  stylesheetUrl: string
  scriptUrl: string
}

const BODY_TAG_RE = /<body[^>]*>([\s\S]*?)<\/body>/i
const HTML_TAG_RE = /<\/?(?:html|head|body)[^>]*>/gi
const STYLE_TAG_RE = /<style\b[\s\S]*?<\/style>/gi
const SCRIPT_TAG_RE = /<script\b[\s\S]*?<\/script>/gi

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttribute(value: string): string {
  return escapeHtml(value)
}

function extractBodyContent(rawHtml: string): string {
  const value = String(rawHtml ?? '').trim()
  if (!value) return ''

  const bodyMatch = value.match(BODY_TAG_RE)
  if (bodyMatch?.[1]) {
    return bodyMatch[1].replace(STYLE_TAG_RE, '').replace(SCRIPT_TAG_RE, '')
  }

  return value
    .replace(STYLE_TAG_RE, '')
    .replace(SCRIPT_TAG_RE, '')
    .replace(HTML_TAG_RE, '')
}

function serializeTheme(theme: PreviewThemeSnapshot): string {
  return encodeURIComponent(JSON.stringify(theme))
}

/**
 * Composes a safe standalone HTML document for the preview iframe.
 */
export function buildPreviewDocumentHtml(
  rawHtml: string,
  theme: PreviewThemeSnapshot,
  assets: PreviewDocumentAssets,
  title: string
): string {
  const body = extractBodyContent(rawHtml)
  const themeContent = serializeTheme(theme)

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light dark"><meta name="tomosona-preview-theme" content="${escapeAttribute(themeContent)}"><link rel="stylesheet" href="${escapeAttribute(assets.stylesheetUrl)}"><script src="${escapeAttribute(assets.scriptUrl)}" defer></script><title>${escapeHtml(title)}</title></head><body>${body}</body></html>`
}
