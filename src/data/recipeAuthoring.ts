import type { Amount, Recipe, RecipeMethod, Tool, Utility } from '../domain/types'

function amounts(entries: Record<string, number>): Amount[] {
  return Object.entries(entries).map(([ingredientId, quantity]) => ({
    ingredientId,
    quantity,
  }))
}

type MethodInput = {
  id: string
  name: string
  appliance?: string
  tools: Tool[]
  water?: string
  minutes: number
  steps: string[]
}

function method({ id, name, appliance, tools, water, minutes, steps }: MethodInput): RecipeMethod {
  const utilities: Utility[] = []
  if (appliance) utilities.push('electricity')
  if (water) utilities.push('potable_water')
  return {
    id,
    name,
    appliances: appliance ? [appliance] : [],
    tools,
    utilities,
    water: water ?? 'No added water.',
    minutes,
    steps,
  }
}

// Families describe the finished meal. Devices, seasonings and protein variants do not create families.
const families: Record<string, string> = {
  R01: 'porridge',
  R02: 'open_sandwich',
  R03: 'yogurt_bowl',
  R04: 'couscous_bowl',
  R05: 'couscous_bowl',
  R06: 'pulse_salad',
  R07: 'wrap',
  R08: 'wrap',
  R09: 'toastie',
  R10: 'pasta',
  R11: 'rice_bowl',
  R12: 'rice_bowl',
  R13: 'potato_bowl',
  R14: 'tray_roast',
  R15: 'soup',
  R16: 'stew',
  R17: 'cereal_bowl',
  R18: 'muesli',
  R19: 'cracker_plate',
  R20: 'fruit_salad',
  R21: 'porridge',
  R22: 'rice_pudding',
  R23: 'pulse_salad',
  R24: 'open_sandwich',
  R25: 'cracker_plate',
  R26: 'rice_bowl',
  R27: 'wrap',
  R28: 'cracker_plate',
  R29: 'potato_bowl',
  R30: 'stuffed_vegetables',
  R31: 'soup',
  R32: 'stew',
  R33: 'pasta',
  R34: 'potato_bowl',
  R35: 'stuffed_vegetables',
  R36: 'toastie',
  R37: 'gratin',
  R38: 'flatbread',
  R39: 'potato_bowl',
  R40: 'couscous_bowl',
}

export function dish(
  id: string,
  name: string,
  required: Record<string, number>,
  optional: Record<string, number>,
  methods: MethodInput[],
): Recipe {
  return {
    id,
    name,
    familyId: families[id],
    provenance:
      'Original NoKitchen synthetic model recipe; quantities and methods are demo fixtures.',
    mealTypes: ['R01', 'R02', 'R03', 'R04', 'R17', 'R18', 'R19', 'R20', 'R21', 'R22'].includes(id)
      ? ['breakfast']
      : ['lunch', 'dinner'],
    required: amounts(required),
    optional: amounts(optional),
    methods: methods.map(method),
    reviewStatus: 'demo',
  }
}
