import { seedHouseholds } from '../data'
import type { BankView, WorkspaceUI } from './uiContract'

const bankViews: BankView[] = [
  'overview',
  'needs',
  'compare',
  'whatif',
  'inventory',
  'households',
  'recipes',
  'donations',
  'packing',
]
export const currentHash = () => window.location.hash
export function listenToRoute(listener: () => void) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}
export type Route = Pick<WorkspaceUI, 'mode' | 'bankView' | 'householdId'>
export function readRoute(hash: string): Route {
  const [mode, view, id] = hash.replace(/^#\/?/, '').split('/')
  const household = mode === 'household' ? view : id
  return {
    mode: mode === 'household' ? 'household' : 'bank',
    bankView: bankViews.includes(view as BankView) ? (view as BankView) : 'overview',
    householdId: seedHouseholds.find((item) => item.id === household)?.id ?? seedHouseholds[0].id,
  }
}
export function setRoute(mode: 'bank' | 'household', view: BankView, id: string) {
  window.location.hash = mode === 'household' ? '/household/' + id : '/bank/' + view + '/' + id
}
