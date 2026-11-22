import { sampleOffers } from '../../data'
import type { DonationOffer, DonationSource } from '../../domain/types'

export class FixtureDonationSource implements DonationSource {
  async listOffers(): Promise<DonationOffer[]> {
    return structuredClone(sampleOffers)
  }
}
