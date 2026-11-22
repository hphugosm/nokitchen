import type { DonorMessage } from '../../domain/donorTypes'

export const sampleMessages = [
  {
    id: 'pouches',
    name: 'Packaged chickpeas',
    text: '12 sealed pouches of ready-to-eat chickpeas, 200 g edible contents each. Delivery 2026-11-23. Best before 2026-12-15.',
  },
  {
    id: 'uncertain',
    name: 'Ambiguous bread and rice',
    text: 'Around 10–15 kg of bread and a few boxes of rice, probably Monday.',
  },
  {
    id: 'expiry',
    name: 'Two pasta expiry groups',
    text: 'Six 500 g dry pasta packets, best before 2027-02-01, and four 500 g packets, best before 2027-03-01.',
  },
] as const

export interface DonorMessageSource {
  obtain(): DonorMessage | Promise<DonorMessage>
}
export class ManualMessageSource implements DonorMessageSource {
  constructor(
    private readonly input: { text: string; sender: string; subject: string },
    private readonly receivedAt: string,
  ) {}
  async obtain(): Promise<DonorMessage> {
    return { ...this.input, kind: 'manual', receivedAt: this.receivedAt }
  }
}
export class ExampleMessageSource implements DonorMessageSource {
  constructor(
    private readonly example: (typeof sampleMessages)[number],
    private readonly receivedAt: string,
  ) {}
  async obtain(): Promise<DonorMessage> {
    return {
      kind: 'fixture',
      externalId: this.example.id,
      text: this.example.text,
      subject: this.example.name,
      sender: 'Demo donor',
      receivedAt: this.receivedAt,
    }
  }
}
