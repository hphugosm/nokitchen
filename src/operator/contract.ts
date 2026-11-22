// Browser/server contract for the separately built operator application.
export type ProcessStage = 'new' | 'imported' | 'reviewed' | 'received'
export interface InboxEntry {
  id: string // Local opaque identifier, safe in paths and stable across syncs.
  offerId: string // Stable NoKitchen domain offer ID, unique to the provider inbox and message.
  inboxId: string
  messageId: string
  sender: string
  subject: string
  receivedAt: string
  preview: string
  attachments: { name: string; contentType?: string; size?: number }[]
  providerStatus: string
  available: boolean
  stage: ProcessStage
  owner: string | null // Local ledger UUID; used only in the private operator application.
}
export interface InboxView {
  connection: 'Connected' | 'Unconfigured' | 'Error' | 'Unchecked'
  address: string | null
  lastSync: string | null
  error: string | null
  hasMore?: boolean // A later operator-triggered sync continues older pages.
  messages: InboxEntry[]
}
export interface ImportedMail {
  entry: InboxEntry
  text: string
}
