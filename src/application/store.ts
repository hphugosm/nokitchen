import { applyAction, createSeed, type Action, type Scenario } from './state'
import {
  decodeScenario,
  encodeScenario,
  STORAGE_KEY,
  V3_STORAGE_KEY,
  PREVIOUS_STORAGE_KEY,
  LEGACY_STORAGE_KEY,
} from './persistence'

interface StoreView {
  scenario: Scenario
  notice: { text: string; error: boolean } | null
  storageWarning: string | null
}
// Keep locally staged private mail away from any public demo served on the same origin.
const operatorMode = typeof __OPERATOR_MODE__ !== 'undefined' && __OPERATOR_MODE__
const scenarioKey = operatorMode ? 'nokitchen.operator.scenario.v4' : STORAGE_KEY
const subscribers = new Set<() => void>()
let lastSaved: string | null = null
const unavailable =
  'Session only. Browser storage is unavailable. Changes will be lost when you reload.'
const malformed =
  'Session only. The stored scenario could not be read. Its original data is preserved. Changes will be lost when you reload.'

function initialize(): StoreView {
  let raw: string | null = null
  try {
    const current = localStorage.getItem(scenarioKey)
    lastSaved = current
    raw = operatorMode
      ? current
      : (current ??
        localStorage.getItem(V3_STORAGE_KEY) ??
        localStorage.getItem(PREVIOUS_STORAGE_KEY) ??
        localStorage.getItem(LEGACY_STORAGE_KEY))
  } catch {
    return { scenario: createSeed(), notice: null, storageWarning: unavailable }
  }
  if (raw !== null) {
    try {
      return { scenario: decodeScenario(raw), notice: null, storageWarning: null }
    } catch {
      return { scenario: createSeed(), notice: null, storageWarning: malformed }
    }
  }
  return { scenario: createSeed(), notice: null, storageWarning: null }
}

let view = initialize()
function publish(next: StoreView) {
  view = next
  subscribers.forEach((listener) => listener())
}
export const getView = () => view
export function subscribe(listener: () => void) {
  subscribers.add(listener)
  return () => {
    subscribers.delete(listener)
  }
}
export const clearNotice = () => publish({ ...view, notice: null })
export function errorNotice(error: unknown) {
  publish({
    ...view,
    notice: {
      text: error instanceof Error ? error.message : 'The change could not be applied.',
      error: true,
    },
  })
}
function inMemory(scenario: Scenario, reason: string, changed: boolean) {
  publish({
    scenario,
    storageWarning: reason,
    notice: changed ? { text: 'Change applied in this tab only.', error: true } : null,
  })
}
function readLatest(): boolean {
  if (view.storageWarning) return false
  let raw: string | null
  try {
    raw = localStorage.getItem(scenarioKey)
  } catch {
    inMemory(view.scenario, unavailable, false)
    return false
  }
  if (raw === null || raw === lastSaved) return true
  let restored: Scenario
  try {
    restored = decodeScenario(raw)
  } catch {
    inMemory(view.scenario, malformed, false)
    return false
  }
  lastSaved = raw
  publish({ scenario: restored, notice: null, storageWarning: null })
  return true
}
window.addEventListener('storage', (event) => {
  if (event.key === scenarioKey) readLatest()
})

/** Recheck input-sensitive commands after acquiring the shared browser lock. */
export function dispatch(action: Action, success: string): boolean {
  const base = view.scenario
  const privateWrite =
    operatorMode &&
    (base.proposals.some((o) => o.document?.message.kind === 'agentboxd') ||
      (action.type === 'savePaste' && action.doc.message.kind === 'agentboxd'))
  if (privateWrite && view.storageWarning) {
    errorNotice(
      Error(
        'Private changes need writable browser storage. Restore storage and reload the operator workspace.',
      ),
    )
    return false
  }
  let next: Scenario
  try {
    next = applyAction(base, action)
  } catch (error) {
    errorNotice(error)
    return false
  }
  function commit() {
    const writable = readLatest()
    const current = view.scenario
    if (current !== base && (action.type !== 'reset' || action.acknowledgedMail)) {
      try {
        if (action.type === 'release' && current.approved?.id !== base.approved?.id)
          throw Error('The active plan has changed. Review it before releasing its reservations.')
        if (
          (action.type === 'household' || action.type === 'stock') &&
          current.revision !== base.revision
        )
          throw Error(
            'The scenario changed in another view. Check the current values and save again.',
          )
        next = applyAction(current, action)
      } catch (error) {
        errorNotice(error)
        return
      }
    }
    if (!writable) {
      if (privateWrite) {
        errorNotice(
          Error('The private change could not be saved. Restore browser storage and retry.'),
        )
        return
      }
      inMemory(next, view.storageWarning ?? unavailable, true)
      return
    }
    try {
      const encoded = encodeScenario(next)
      localStorage.setItem(scenarioKey, encoded)
      lastSaved = encoded
    } catch {
      if (privateWrite) {
        inMemory(current, unavailable, false)
        errorNotice(Error('The private change was not saved. Restore browser storage and retry.'))
        return
      }
      inMemory(next, unavailable, true)
      return
    }
    publish({ scenario: next, notice: { text: success, error: false }, storageWarning: null })
  }
  if (view.storageWarning) {
    commit()
    return true
  }
  // Browsers without Web Locks still support a local session.
  try {
    if (navigator.locks) {
      let acquired = false
      void navigator.locks
        .request(scenarioKey, () => {
          acquired = true
          commit()
        })
        .catch((error) => {
          if (acquired) errorNotice(error)
          else {
            if (privateWrite) {
              errorNotice(
                Error('Could not acquire the local operator storage lock. Retry the change.'),
              )
              return
            }
            inMemory(view.scenario, unavailable, false)
            commit()
          }
        })
    } else commit()
  } catch {
    commit()
  }
  return true
}
