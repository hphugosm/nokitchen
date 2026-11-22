import type { DonorMessage } from '../../domain/donorTypes'
import type { ImportedMail } from '../../operator/contract'
import type { DonorMessageSource } from './messages'

/** A single message already claimed from the private staging service. */
export class AgentboxdDonationSource implements DonorMessageSource {
  constructor(private readonly mail: ImportedMail) {}
  obtain(): DonorMessage {
    const { entry, text } = this.mail
    if (
      !entry.available ||
      !text.trim() ||
      text.length > 16000 ||
      !entry.inboxId ||
      !entry.messageId
    )
      throw Error('This message is unavailable for donation review.')
    return {
      kind: 'agentboxd',
      externalId: entry.messageId,
      inboxId: entry.inboxId,
      stagingId: entry.id,
      text,
      sender: entry.sender,
      subject: entry.subject,
      receivedAt: entry.receivedAt,
    }
  }
}
