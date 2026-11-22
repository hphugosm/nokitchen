import { afterEach, expect, it, vi } from 'vitest'
import { applyAction, createSeed } from '../src/application/state'
import { decodeScenario, encodeScenario, STORAGE_KEY } from '../src/application/persistence'

async function browserWith(raw: string, failure?: 'read' | 'write') {
  vi.resetModules()
  const disk = new Map([[STORAGE_KEY, raw]])
  const queue: (() => void)[] = []
  let storageListener: (event: { key: string; newValue: string }) => void = () => {}
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => {
      if (failure === 'read') throw Error('Access denied')
      return disk.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (failure === 'write') throw Error('Quota exceeded')
      disk.set(key, value)
    },
  })
  vi.stubGlobal('navigator', {
    locks: {
      request: async (_key: string, write: () => void) => {
        queue.push(write)
      },
    },
  })
  vi.stubGlobal('window', {
    addEventListener: (_type: string, fn: typeof storageListener) => {
      storageListener = fn
    },
  })
  const store = await import('../src/application/store')
  return {
    ...store,
    disk,
    flush: () => queue.shift()!(),
    delayedEvent: () => storageListener({ key: STORAGE_KEY, newValue: raw }),
  }
}
afterEach(() => vi.unstubAllGlobals())

it('keeps the latest reservation owner when another tab replaces a plan ahead of a queued release', async () => {
  const seed = createSeed()
  const approved = applyAction(seed, { type: 'approve', planId: seed.draft!.id })
  const tab = await browserWith(encodeScenario(approved))
  tab.dispatch({ type: 'release' }, 'Released')
  const edit = applyAction(approved, {
    type: 'household',
    household: { ...seed.households[0], peopleCount: 2 },
  })
  const revised = applyAction(edit, { type: 'recalculate' })
  const replacement = applyAction(revised, { type: 'approve', planId: revised.draft!.id })
  tab.disk.set(STORAGE_KEY, encodeScenario(replacement))
  tab.flush()
  expect(decodeScenario(tab.disk.get(STORAGE_KEY)!).approved!.id).toBe(replacement.approved!.id)
  expect(tab.getView().notice?.error).toBe(true)
  tab.delayedEvent()
  expect(tab.getView().scenario.approved!.id).toBe(replacement.approved!.id)
})

it.each(['read', 'write', 'parse'] as const)(
  'remains usable in memory after a %s failure and preserves original storage',
  async (failure) => {
    const raw = failure === 'parse' ? 'unexpected invalid JSON' : encodeScenario(createSeed())
    const tab = await browserWith(raw, failure === 'parse' ? undefined : failure)
    tab.dispatch({ type: 'offer', id: 'OFFER-01', step: 'load' }, 'Offer saved')
    if (failure === 'write') tab.flush()
    expect(tab.getView().scenario.offerStatus['OFFER-01']).toBe('offered')
    expect(tab.getView().storageWarning).toMatch(/Session only/)
    expect(tab.getView().notice?.text).not.toMatch(/saved/i)
    tab.clearNotice()
    expect(tab.getView().storageWarning).toMatch(/Session only/)
    tab.dispatch({ type: 'offer', id: 'OFFER-01', step: 'review' }, 'Review saved')
    expect(tab.getView().scenario.offerStatus['OFFER-01']).toBe('reviewed')
    expect(tab.disk.get(STORAGE_KEY)).toBe(raw)
  },
)

it('preserves a parseable record with malformed selection evidence and uses a working session instead', async () => {
  const saved = JSON.parse(encodeScenario(createSeed()))
  saved.plans[saved.draftId].selection.candidates = null
  const raw = JSON.stringify(saved)
  const tab = await browserWith(raw)
  expect(tab.getView().storageWarning).toContain('original data is preserved')
  tab.dispatch({ type: 'reset' }, 'Saved')
  expect(tab.getView().scenario.draft?.selection?.candidates.some((c) => c.valid)).toBe(true)
  expect(tab.disk.get(STORAGE_KEY)).toBe(raw)
})
