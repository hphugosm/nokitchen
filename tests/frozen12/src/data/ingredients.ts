import type { Appliance, Ingredient, Storage, Unit } from '../domain/types'

export const appliances: Appliance[] = [
  { id: 'kettle', name: 'Electric kettle' },
  { id: 'microwave', name: 'Microwave' },
  { id: 'hob', name: 'Electric hob' },
  { id: 'rice_cooker', name: 'Rice cooker' },
  { id: 'sandwich_press', name: 'Sandwich maker' },
  { id: 'mini_oven', name: 'Mini oven' },
]

// Every declaration describes this hypothetical labeled product only.
type Label = [
  id: string,
  name: string,
  group: string,
  unit: Unit,
  allergens: string[],
  diet: 'vegan' | 'vegetarian' | 'fish',
  storage: Storage,
]
const labels: Label[] = [
  ['oats', 'Oats', 'Grains', 'g', ['gluten'], 'vegan', 'ambient'],
  ['instant_couscous', 'Instant couscous', 'Grains', 'g', ['gluten'], 'vegan', 'ambient'],
  ['dry_rice', 'Dry rice', 'Grains', 'g', [], 'vegan', 'ambient'],
  ['dry_pasta', 'Dry pasta', 'Grains', 'g', ['gluten'], 'vegan', 'ambient'],
  ['bread', 'Bread', 'Grains', 'g', ['gluten'], 'vegan', 'ambient'],
  ['tortilla', 'Tortilla', 'Grains', 'each', ['gluten'], 'vegan', 'ambient'],
  ['potato', 'Potato', 'Produce', 'g', [], 'vegan', 'ambient'],
  ['crackers', 'Crackers', 'Grains', 'g', ['gluten'], 'vegan', 'ambient'],
  ['ready_chickpeas', 'Ready-to-eat chickpeas', 'Pulses', 'g', [], 'vegan', 'ambient'],
  ['ready_beans', 'Ready-to-eat beans', 'Pulses', 'g', [], 'vegan', 'ambient'],
  ['ready_lentils', 'Ready-to-eat lentils', 'Pulses', 'g', [], 'vegan', 'ambient'],
  ['sweetcorn', 'Sweetcorn', 'Produce', 'g', [], 'vegan', 'ambient'],
  ['canned_tuna', 'Canned tuna', 'Fish', 'g', ['fish'], 'fish', 'ambient'],
  ['uht_milk', 'UHT milk', 'Dairy', 'ml', ['milk'], 'vegetarian', 'ambient'],
  ['yogurt', 'Yogurt', 'Dairy', 'g', ['milk'], 'vegetarian', 'fridge'],
  ['cheese', 'Cheese', 'Dairy', 'g', ['milk'], 'vegetarian', 'fridge'],
  ['carrot', 'Carrot', 'Produce', 'g', [], 'vegan', 'ambient'],
  ['tomato', 'Tomato', 'Produce', 'g', [], 'vegan', 'ambient'],
  ['cucumber', 'Cucumber', 'Produce', 'g', [], 'vegan', 'ambient'],
  ['apple', 'Apple', 'Fruit', 'g', [], 'vegan', 'ambient'],
  ['banana', 'Banana', 'Fruit', 'g', [], 'vegan', 'ambient'],
  ['frozen_vegetables', 'Frozen vegetables', 'Produce', 'g', [], 'vegan', 'freezer'],
  ['raisins', 'Raisins', 'Fruit', 'g', [], 'vegan', 'ambient'],
  ['passata', 'Tomato passata', 'Pantry', 'g', [], 'vegan', 'ambient'],
  ['oil', 'Cooking oil', 'Pantry', 'ml', [], 'vegan', 'ambient'],
  ['peanut_butter', 'Peanut butter', 'Pantry', 'g', ['peanut'], 'vegan', 'ambient'],
  ['salt', 'Salt', 'Seasonings', 'g', [], 'vegan', 'ambient'],
  ['dried_herbs', 'Dried herbs', 'Seasonings', 'g', [], 'vegan', 'ambient'],
  ['cinnamon', 'Cinnamon', 'Seasonings', 'g', [], 'vegan', 'ambient'],
  [
    'vegetable_soup',
    'Prepared vegetable soup',
    'Prepared foods',
    'ml',
    ['celery'],
    'vegan',
    'ambient',
  ],
]

// Product-specific handling used by the authored methods.
const labelNotes: Record<string, string> = {
  oats: 'Rolled oats labeled for cooked or cold use.',
  bread: 'Sliced bread suitable for portioning by weight.',
  sweetcorn: 'Canned, cooked sweetcorn labeled ready to eat. Quantity is drained content.',
  vegetable_soup: 'Ready-to-heat vegetable soup used at full strength.',
}

export const ingredients: Ingredient[] = labels.map(
  ([id, name, group, unit, allergens, diet, storage]) => ({
    id,
    name,
    group,
    unit,
    allergens,
    declaration: 'declared',
    dietaryTags:
      diet === 'vegan'
        ? ['vegan', 'vegetarian']
        : diet === 'vegetarian'
          ? ['vegetarian']
          : ['pescatarian'],
    provenance: ['Synthetic product label for the NoKitchen demo.', labelNotes[id]]
      .filter(Boolean)
      .join(' '),
    reviewStatus: 'demo',
    storage,
  }),
)
