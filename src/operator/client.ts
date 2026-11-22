import type { ImportedMail, InboxView } from './contract'

const ledgerKey = 'nokitchen.operator.ledger.v1'
export function ledgerId(): string {
  let id = localStorage.getItem(ledgerKey)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(ledgerKey, id)
  }
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw Error('Cannot identify this operator browser ledger.')
  return id
}

async function request<T>(path: string, payload?: object): Promise<T> {
  const response = await fetch('/api/inbox' + path, {
    method: payload ? 'POST' : 'GET',
    credentials: 'same-origin',
    mode: 'same-origin',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'X-NoKitchen-Operator': '1',
      ...(payload ? { 'Content-Type': 'application/json' } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(60000),
  })
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw Error('The local operator service did not return an inbox response.')
  const result = await response.json()
  if (!response.ok)
    throw Error(typeof result?.error === 'string' ? result.error : 'Local operator request failed.')
  return result as T
}
export const getInbox = () => request<InboxView>('')
export const syncInbox = () => request<InboxView>('/sync', {})
export function importMail(id: string) {
  return request<ImportedMail>('/messages/' + encodeURIComponent(id) + '/import', {
    ledgerId: ledgerId(),
  })
}
export async function reportStage(id: string, stage: 'reviewed' | 'received') {
  await request('/messages/' + encodeURIComponent(id) + '/stage', { ledgerId: ledgerId(), stage })
  window.dispatchEvent(new Event('nokitchen-inbox-updated'))
}
