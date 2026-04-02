(function () {
  function applyTheme() {
    var themeMeta = document.querySelector('meta[name="tomosona-preview-theme"]')
    if (!themeMeta || !themeMeta.content) return

    try {
      var theme = JSON.parse(decodeURIComponent(themeMeta.content))
      if (!theme || typeof theme !== 'object') return

      var root = document.documentElement
      var vars = theme.vars && typeof theme.vars === 'object' ? theme.vars : {}

      Object.keys(vars).forEach(function (name) {
        var value = vars[name]
        if (typeof value === 'string' && value) {
          root.style.setProperty(name, value)
        }
      })

      root.dataset.colorScheme = theme.colorScheme === 'dark' ? 'dark' : 'light'
    } catch (_error) {
      // Ignore malformed theme payloads and keep the preview usable.
    }
  }

  function isModW(event) {
    return (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && (event.key || '').toLowerCase() === 'w'
  }

  function setActive(root, sheetId) {
    var tabs = Array.from(root.querySelectorAll('[data-spreadsheet-tab]'))
    var sheets = Array.from(root.querySelectorAll('[data-spreadsheet-sheet]'))

    tabs.forEach(function (tab) {
      var isActive = tab.dataset.sheetId === sheetId
      tab.dataset.active = isActive ? 'true' : 'false'
      tab.setAttribute('aria-current', isActive ? 'true' : 'false')
    })

    sheets.forEach(function (sheet) {
      var isActive = sheet.dataset.sheetId === sheetId
      sheet.dataset.active = isActive ? 'true' : 'false'
      sheet.hidden = !isActive
    })
  }

  function initSpreadsheetTabs() {
    var root = document.querySelector('[data-spreadsheet-preview]')
    if (!root) return

    root.addEventListener('click', function (event) {
      var tab = event.target.closest('[data-spreadsheet-tab]')
      if (!tab || !root.contains(tab)) return
      event.preventDefault()
      setActive(root, tab.dataset.sheetId)
    })

    var initial = root.querySelector('[data-spreadsheet-tab][data-active="true"]') || root.querySelector('[data-spreadsheet-tab]')
    if (initial) {
      setActive(root, initial.dataset.sheetId)
    }
  }

  function initKeyboardGuard() {
    window.addEventListener('keydown', function (event) {
      if (!isModW(event)) return
      event.preventDefault()
      event.stopPropagation()
    }, true)
  }

  applyTheme()
  initSpreadsheetTabs()
  initKeyboardGuard()
})()
