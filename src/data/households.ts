import type { Household, Tool } from '../domain/types'

const basic: Tool[] = ['knife', 'cutting_board', 'bowl', 'spoon']
const opener: Tool[] = [...basic, 'can_opener']
const hobTools: Tool[] = [...opener, 'pot_with_lid', 'strainer']

function household(
  id: string,
  peopleCount: number,
  appliances: string[],
  tools: Tool[],
  storage: Household['storage'],
  changes: Partial<Pick<Household, 'burners' | 'allergens' | 'excludedIngredientIds'>> = {},
): Household {
  return {
    id,
    name: 'Household ' + id.slice(1),
    peopleCount,
    appliances,
    tools: [...tools],
    burners: 0,
    storage,
    utilities: ['electricity', 'potable_water'],
    allergens: [],
    excludedIngredientIds: [],
    dietaryPreferences: [],
    collectionDays: [0, 4],
    ...changes,
  }
}

export const seedHouseholds: Household[] = [
  household('H01', 1, [], basic, []),
  household('H02', 2, ['kettle'], [...opener, 'heatproof_bowl'], []),
  household('H03', 3, ['microwave'], [...opener, 'microwave_safe_container'], ['fridge']),
  household('H04', 1, ['hob'], hobTools, ['fridge'], { burners: 1, allergens: ['peanut'] }),
  household('H05', 4, ['hob'], hobTools, ['fridge', 'freezer'], {
    burners: 2,
    allergens: ['milk'],
  }),
  household('H06', 2, ['rice_cooker'], opener, ['fridge'], {
    excludedIngredientIds: ['canned_tuna'],
  }),
  household('H07', 2, ['sandwich_press', 'kettle'], [...opener, 'heatproof_bowl'], ['fridge']),
  household(
    'H08',
    3,
    ['mini_oven', 'microwave'],
    [...opener, 'oven_safe_tray', 'microwave_safe_container'],
    ['fridge', 'freezer'],
  ),
]
