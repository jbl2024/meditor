type StorageLike = Pick<Storage, 'clear' | 'getItem' | 'key' | 'length' | 'removeItem' | 'setItem'>

function createStorage(): StorageLike {
  const data = new Map<string, string>()

  return {
    get length() {
      return data.size
    },
    clear() {
      data.clear()
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key) ?? null : null
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null
    },
    removeItem(key: string) {
      data.delete(key)
    },
    setItem(key: string, value: string) {
      data.set(key, String(value))
    }
  }
}

const localStorageMock = createStorage()
const sessionStorageMock = createStorage()

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock
})

Object.defineProperty(window, 'sessionStorage', {
  configurable: true,
  value: sessionStorageMock
})

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock
})

Object.defineProperty(globalThis, 'sessionStorage', {
  configurable: true,
  value: sessionStorageMock
})

Object.defineProperty(window, 'scrollBy', {
  configurable: true,
  value: () => {}
})

Object.defineProperty(window, 'scrollTo', {
  configurable: true,
  value: () => {}
})

Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  configurable: true,
  writable: true,
  value: () => {}
})

Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  writable: true,
  value: function scrollTo(optionsOrX?: ScrollToOptions | number, y?: number) {
    if (typeof optionsOrX === 'number') {
      this.scrollTop = typeof y === 'number' ? y : optionsOrX
      return
    }

    if (optionsOrX && typeof optionsOrX === 'object' && typeof optionsOrX.top === 'number') {
      this.scrollTop = optionsOrX.top
    }
  }
})
