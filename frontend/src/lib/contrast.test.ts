import { act, renderHook } from '@testing-library/react'
import {
  CONTRAST_KEY,
  getContrastSnapshot,
  initContrast,
  readContrastPreference,
  resolveContrast,
  setContrastPreference,
  setSessionContrast,
  subscribeContrast,
  toggleContrast,
  useContrast,
} from './contrast'

const root = document.documentElement
let disposers: (() => void)[] = []

/** A matchMedia whose `prefers-contrast: more` answer the test controls, and whose 'change' listeners it can fire. */
function stubSystem(more: boolean) {
  const state = { more, listeners: new Set<() => void>() }
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query.includes('prefers-contrast') && state.more
    },
    media: query,
    addEventListener: (_: string, listener: () => void) => state.listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => state.listeners.delete(listener),
  }))
  return {
    listeners: state.listeners,
    set(next: boolean) {
      state.more = next
      for (const listener of state.listeners) listener()
    },
  }
}

function init(): void {
  disposers.push(initContrast())
}

afterEach(() => {
  for (const off of disposers) off()
  disposers = []
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setContrastPreference('system')
})

describe('readContrastPreference', () => {
  it("is 'system' when nothing is stored", () => {
    expect(readContrastPreference()).toBe('system')
  })

  it("treats unknown values as 'system'", () => {
    for (const value of ['dark', '"><script>', 'MORE', '']) {
      localStorage.setItem(CONTRAST_KEY, value)
      expect(readContrastPreference()).toBe('system')
    }
  })

  it("is 'system' when storage throws", () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(readContrastPreference()).toBe('system')
  })
})

describe('resolveContrast', () => {
  it('follows the device only for system', () => {
    expect(resolveContrast('system', true)).toBe('more')
    expect(resolveContrast('system', false)).toBe('standard')
    expect(resolveContrast('more', false)).toBe('more')
    expect(resolveContrast('standard', true)).toBe('standard')
  })
})

describe('setContrastPreference', () => {
  it("sets data-contrast='more' and removes it for standard, never writing 'standard' to the DOM", () => {
    setContrastPreference('more')
    expect(root.dataset.contrast).toBe('more')
    expect(localStorage.getItem(CONTRAST_KEY)).toBe('more')
    setContrastPreference('standard')
    expect(root.hasAttribute('data-contrast')).toBe(false)
    expect(localStorage.getItem(CONTRAST_KEY)).toBe('standard')
  })

  it("removes the stored key for 'system'", () => {
    setContrastPreference('more')
    setContrastPreference('system')
    expect(localStorage.getItem(CONTRAST_KEY)).toBeNull()
    expect(root.hasAttribute('data-contrast')).toBe(false)
  })

  it('still applies for the session when storage refuses to write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => setContrastPreference('more')).not.toThrow()
    expect(root.dataset.contrast).toBe('more')
    expect(getContrastSnapshot().preference).toBe('more')
    expect(localStorage.getItem(CONTRAST_KEY)).toBeNull()
  })

  it('can hold a choice for the session without storing it', () => {
    localStorage.setItem(CONTRAST_KEY, 'standard')
    setSessionContrast('more')
    expect(root.dataset.contrast).toBe('more')
    expect(getContrastSnapshot().preference).toBe('more')
    expect(localStorage.getItem(CONTRAST_KEY)).toBe('standard')
  })

  it('notifies subscribers only when something changes', () => {
    const listener = vi.fn()
    const off = subscribeContrast(listener)
    getContrastSnapshot()
    setContrastPreference('more')
    setContrastPreference('more')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(getContrastSnapshot()).toEqual({ preference: 'more', effective: 'more' })
    off()
  })
})

describe('the device setting', () => {
  it("re-applies when prefers-contrast changes under 'system'", () => {
    const system = stubSystem(false)
    init()
    expect(root.hasAttribute('data-contrast')).toBe(false)
    system.set(true)
    expect(root.dataset.contrast).toBe('more')
    expect(getContrastSnapshot()).toEqual({ preference: 'system', effective: 'more' })
    system.set(false)
    expect(root.hasAttribute('data-contrast')).toBe(false)
  })

  it('does not throw without matchMedia and resolves to standard', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(() => init()).not.toThrow()
    expect(getContrastSnapshot().effective).toBe('standard')
  })
})

describe('toggleContrast', () => {
  it('goes back to system when the choice matches the device (device asks for more)', () => {
    stubSystem(true)
    init()
    expect(root.dataset.contrast).toBe('more')
    toggleContrast()
    expect(localStorage.getItem(CONTRAST_KEY)).toBe('standard')
    expect(root.hasAttribute('data-contrast')).toBe(false)
    toggleContrast()
    expect(localStorage.getItem(CONTRAST_KEY)).toBeNull()
    expect(root.dataset.contrast).toBe('more')
  })

  it('goes back to system when the choice matches the device (device asks for nothing)', () => {
    stubSystem(false)
    init()
    toggleContrast()
    expect(localStorage.getItem(CONTRAST_KEY)).toBe('more')
    expect(root.dataset.contrast).toBe('more')
    toggleContrast()
    expect(localStorage.getItem(CONTRAST_KEY)).toBeNull()
    expect(root.hasAttribute('data-contrast')).toBe(false)
  })
})

describe('other tabs', () => {
  const fire = (key: string | null, newValue: string | null): void => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue }))
  }

  it('applies a choice made in another tab and notifies subscribers', () => {
    init()
    const listener = vi.fn()
    const off = subscribeContrast(listener)
    localStorage.setItem(CONTRAST_KEY, 'more')
    fire(CONTRAST_KEY, 'more')
    expect(root.dataset.contrast).toBe('more')
    expect(listener).toHaveBeenCalled()
    off()
  })

  it('lets another tab override a choice this tab could not store', () => {
    init()
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota')
    })
    setContrastPreference('more')
    localStorage.setItem(CONTRAST_KEY, 'standard')
    fire(CONTRAST_KEY, 'standard')
    expect(getContrastSnapshot().preference).toBe('standard')
    expect(root.hasAttribute('data-contrast')).toBe(false)
  })

  it("resolves an invalid value as 'system' and ignores other keys", () => {
    init()
    localStorage.setItem(CONTRAST_KEY, '"><script>')
    fire(CONTRAST_KEY, '"><script>')
    expect(getContrastSnapshot().preference).toBe('system')
    expect(root.hasAttribute('data-contrast')).toBe(false)
    localStorage.setItem(CONTRAST_KEY, 'more')
    fire('doory.something.else', 'x')
    expect(root.hasAttribute('data-contrast')).toBe(false)
  })

  it('attaches one listener however often it is started, and the disposer removes it', () => {
    const system = stubSystem(false)
    const add = vi.spyOn(window, 'addEventListener')
    const off = initContrast()
    expect(initContrast()).toBe(off)
    expect(add.mock.calls.filter(([type]) => type === 'storage')).toHaveLength(1)
    expect(system.listeners.size).toBe(1)
    off()
    expect(system.listeners.size).toBe(0)
    localStorage.setItem(CONTRAST_KEY, 'more')
    fire(CONTRAST_KEY, 'more')
    expect(root.hasAttribute('data-contrast')).toBe(false)
  })
})

describe('disposers', () => {
  it('only remove their own listeners, once', () => {
    const system = stubSystem(false)
    const first = initContrast()
    first()
    const second = initContrast()
    first()
    expect(system.listeners.size).toBe(1)
    expect(initContrast()).toBe(second)
    second()
    expect(system.listeners.size).toBe(0)
  })
})

describe('useContrast', () => {
  it('returns a stable snapshot and updates on change', () => {
    const { result, rerender } = renderHook(() => useContrast())
    const first = result.current
    rerender()
    expect(result.current).toBe(first)
    expect(first).toEqual({ preference: 'system', effective: 'standard' })
    act(() => setContrastPreference('more'))
    expect(result.current).toEqual({ preference: 'more', effective: 'more' })
  })
})
