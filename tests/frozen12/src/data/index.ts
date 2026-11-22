import type { Catalog } from '../domain/types'
import { appliances, ingredients } from './ingredients'
import { recipes } from './recipes'

export { seedHouseholds } from './households'
export { seedLots } from './stock'
export { sampleOffers } from './donationFixtures'
export const catalog: Catalog = { ingredients, appliances, recipes }
