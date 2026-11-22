import { productLabels } from './productLabels'
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
  ['ready_rice', 'Ready-to-eat rice', 'Grains', 'g', [], 'vegan', 'ambient'],
  ['potato_flakes', 'Instant potato flakes', 'Pantry', 'g', [], 'vegan', 'ambient'],
  ['red_lentils', 'Dry red lentils', 'Pulses', 'g', [], 'vegan', 'ambient'],
  ['ready_beetroot', 'Cooked beetroot', 'Produce', 'g', [], 'vegan', 'ambient'],
  ['hummus', 'Hummus', 'Pulses', 'g', ['sesame'], 'vegan', 'ambient'],
  ['sardines', 'Ready-to-eat sardines', 'Fish', 'g', ['fish'], 'fish', 'ambient'],
  ['sweet_potato', 'Sweet potato', 'Produce', 'g', [], 'vegan', 'ambient'],
  ['ready_peas', 'Ready-to-eat peas', 'Produce', 'g', [], 'vegan', 'ambient'],
  ['cabbage', 'Cabbage', 'Produce', 'g', [], 'vegan', 'ambient'],
  ['bell_pepper', 'Bell pepper', 'Produce', 'g', [], 'vegan', 'ambient'],
  ['onion', 'Onion', 'Produce', 'g', [], 'vegan', 'ambient'],
  ['spinach', 'Spinach', 'Produce', 'g', [], 'vegan', 'fridge'],
  ['pear', 'Pear', 'Fruit', 'g', [], 'vegan', 'ambient'],
  ['orange', 'Orange', 'Fruit', 'g', [], 'vegan', 'ambient'],
  ['dried_apricots', 'Dried apricots', 'Fruit', 'g', ['sulphites'], 'vegan', 'ambient'],
  ['sunflower_spread', 'Sunflower seed spread', 'Pantry', 'g', [], 'vegan', 'ambient'],
  ['jam', 'Jam', 'Pantry', 'g', [], 'vegan', 'ambient'],
  ['oat_drink', 'UHT oat drink', 'Pantry', 'ml', ['gluten'], 'vegan', 'ambient'],
  ['apple_puree', 'Apple puree', 'Fruit', 'g', [], 'vegan', 'ambient'],
  ['rice_cereal', 'Puffed rice cereal', 'Grains', 'g', [], 'vegan', 'ambient'],
]

export const ingredients: Ingredient[] = labels.map(
  ([id, name, group, unit, allergens, diet, storage]) => ({
    id,
    aliases: productLabels[id].aliases,
    edibleBasis: productLabels[id].basis,
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
    provenance: ['Synthetic product label for the NoKitchen demo.', productLabels[id].description]
      .filter(Boolean)
      .join(' '),
    reviewStatus: 'demo',
    storage,
  }),
)
