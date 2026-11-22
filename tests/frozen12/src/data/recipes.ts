import type { Amount, Recipe, RecipeMethod, Tool, Utility } from '../domain/types'

function amounts(entries: Record<string, number>): Amount[] {
  return Object.entries(entries).map(([ingredientId, quantity]) => ({ ingredientId, quantity }))
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

const prep: Tool[] = ['knife', 'cutting_board']
const serving: Tool[] = ['bowl', 'spoon']
const cinnamon = { cinnamon: 1 }
const herbs = { dried_herbs: 1 }
const salt = { salt: 1 }
const produceWater = 'Potable water for rinsing produce.'

function dish(
  id: string,
  name: string,
  required: Record<string, number>,
  optional: Record<string, number>,
  methods: MethodInput[],
): Recipe {
  return {
    id,
    name,
    mealTypes: ['R01', 'R02', 'R03', 'R04'].includes(id) ? ['breakfast'] : ['lunch', 'dinner'],
    required: amounts(required),
    optional: amounts(optional),
    methods: methods.map(method),
    reviewStatus: 'demo',
  }
}

export const recipes: Recipe[] = [
  dish('R01', 'Banana oatmeal', { oats: 60, uht_milk: 200, banana: 100 }, cinnamon, [
    {
      id: 'R01-microwave',
      name: 'Microwave',
      appliance: 'microwave',
      tools: ['microwave_safe_container', 'spoon'],
      minutes: 6,
      steps: [
        'Stir the oats and milk together in a deep microwave-safe container.',
        'Heat in short bursts according to the oat packet, stirring between bursts. Let the oats stand until softened.',
        'Peel the banana, break it into pieces and stir it into the oats.',
      ],
    },
    {
      id: 'R01-hob',
      name: 'Hob',
      appliance: 'hob',
      tools: ['pot_with_lid', 'spoon'],
      minutes: 9,
      steps: [
        'Combine the oats and milk in a pot. Warm gently on the hob, stirring until the oats soften.',
        'Take the pot off the heat. Peel the banana, break it into pieces and fold it into the oats.',
      ],
    },
  ]),
  dish(
    'R02',
    'Peanut butter and banana bread',
    { bread: 80, peanut_butter: 25, banana: 100 },
    cinnamon,
    [
      {
        id: 'R02-cold',
        name: 'No heat',
        tools: ['spoon'],
        minutes: 4,
        steps: [
          'Spread the peanut butter on the sliced bread with the back of a spoon.',
          'Peel the banana and break it into small pieces. Gently press the pieces onto the bread.',
        ],
      },
    ],
  ),
  dish('R03', 'Apple yogurt bowl', { yogurt: 150, apple: 100, oats: 40 }, cinnamon, [
    {
      id: 'R03-cold',
      name: 'No heat',
      tools: [...prep, ...serving],
      water: produceWater,
      minutes: 5,
      steps: [
        'Rinse the apple. On the cutting board, core and chop it with the knife.',
        'Spoon the yogurt into a bowl, then stir in the oats and the chopped apple.',
      ],
    },
  ]),
  dish(
    'R04',
    'Sweet couscous with raisins',
    { instant_couscous: 60, uht_milk: 200, raisins: 20 },
    cinnamon,
    [
      {
        id: 'R04-kettle',
        name: 'Kettle',
        appliance: 'kettle',
        tools: ['heatproof_bowl', 'spoon'],
        water: 'Use the amount of potable water specified on the instant couscous packet.',
        minutes: 9,
        steps: [
          'Heat plain water in the kettle. Put the couscous and raisins into a separate heatproof bowl.',
          'Pour in hot water following the couscous packet and let the grains absorb it for the stated time.',
          'Fluff with a spoon and pour the milk directly into the bowl to serve.',
        ],
      },
    ],
  ),
  dish(
    'R05',
    'Chickpea couscous bowl',
    { instant_couscous: 80, ready_chickpeas: 200, tomato: 100, oil: 10 },
    herbs,
    [
      {
        id: 'R05-kettle',
        name: 'Kettle',
        appliance: 'kettle',
        tools: ['heatproof_bowl', 'spoon', ...prep],
        water:
          'Potable water to rinse the tomato and hydrate the couscous according to its packet.',
        minutes: 12,
        steps: [
          'Heat plain water in the kettle. Put the couscous in a heatproof bowl, add hot water as directed on the packet and let it absorb.',
          'Rinse the tomato and dice it on the cutting board. Open the ready-to-eat chickpeas and pour off the packing liquid.',
          'Stir the chickpeas, diced tomato and oil through the couscous with the spoon.',
        ],
      },
    ],
  ),
  dish(
    'R06',
    'Lentil salad with bread',
    { ready_lentils: 200, cucumber: 100, tomato: 100, bread: 60 },
    herbs,
    [
      {
        id: 'R06-cold',
        name: 'No heat',
        tools: [...prep, ...serving],
        water: produceWater,
        minutes: 8,
        steps: [
          'Rinse the cucumber and tomato. Chop both into bite-sized pieces on the cutting board.',
          'Open the ready-to-eat lentils and pour off the packing liquid. Mix the lentils and vegetables in a bowl and serve with the bread.',
        ],
      },
    ],
  ),
  dish('R07', 'Bean and corn tortilla', { tortilla: 1, ready_beans: 200, sweetcorn: 100 }, {}, [
    {
      id: 'R07-cold',
      name: 'No heat',
      tools: serving,
      minutes: 5,
      steps: [
        'Open the ready-to-eat beans and sweetcorn and pour off the packing liquid.',
        'Mash some of the beans in a bowl with the back of a spoon. Fold in the corn and serve with the tortilla, spooning in filling as you eat.',
      ],
    },
    {
      id: 'R07-microwave',
      name: 'Microwave',
      appliance: 'microwave',
      tools: ['microwave_safe_container', 'spoon'],
      minutes: 7,
      steps: [
        'Open the ready-to-eat beans and corn and pour off the packing liquid. Transfer both to the microwave-safe container.',
        'Warm in short bursts, stirring between bursts. Serve with the tortilla and spoon in filling as you eat.',
      ],
    },
  ]),
  dish('R08', 'Tuna cucumber wraps', { tortilla: 2, canned_tuna: 100, cucumber: 100 }, {}, [
    {
      id: 'R08-cold',
      name: 'No heat',
      tools: [...prep, ...serving],
      water: produceWater,
      minutes: 7,
      steps: [
        'Rinse the cucumber and dice it on the cutting board. Open the tuna and pour off its packing liquid.',
        'Flake the tuna into a bowl and stir in the cucumber. Spoon the mixture onto the tortillas and roll them up.',
      ],
    },
  ]),
  dish('R09', 'Cheese and tomato toastie', { bread: 80, cheese: 40, tomato: 80 }, herbs, [
    {
      id: 'R09-press',
      name: 'Sandwich maker',
      appliance: 'sandwich_press',
      tools: prep,
      water: produceWater,
      minutes: 9,
      steps: [
        'Rinse the tomato and slice it on the cutting board. Layer the cheese and tomato between slices of bread.',
        'Preheat the sandwich maker as directed by its manual. Toast the sandwich according to the appliance instructions until the cheese melts.',
      ],
    },
  ]),
  dish('R10', 'Tomato pasta', { dry_pasta: 80, passata: 200, oil: 10 }, herbs, [
    {
      id: 'R10-hob',
      name: 'Hob',
      appliance: 'hob',
      tools: ['pot_with_lid', 'strainer', 'spoon'],
      water: 'Use potable cooking water as directed on the pasta packet.',
      minutes: 22,
      steps: [
        'Bring the packet-directed amount of water to a boil in a pot. Add the pasta and cook for the stated time.',
        'Drain the pasta in the strainer. Warm the passata and oil in the same pot, stir the pasta back in and heat through.',
      ],
    },
  ]),
  dish('R11', 'Rice and beans', { dry_rice: 80, ready_beans: 200 }, herbs, [
    {
      id: 'R11-hob',
      name: 'Hob',
      appliance: 'hob',
      tools: ['pot_with_lid', 'spoon'],
      water: 'Use the amount of potable water given on the rice packet for absorption cooking.',
      minutes: 25,
      steps: [
        'Cook the rice and measured water in the lidded pot following the rice packet.',
        'Open the ready-to-eat beans and pour off the packing liquid. Spoon the beans into the cooked rice, stir over low heat and serve.',
      ],
    },
    {
      id: 'R11-cooker',
      name: 'Rice cooker',
      appliance: 'rice_cooker',
      tools: serving,
      water: 'Measure potable water for the rice using the rice cooker and product instructions.',
      minutes: 30,
      steps: [
        'Put the rice and water in the rice cooker, using the amounts and cycle specified by the appliance and rice packet.',
        'Open the ready-to-eat beans and pour off the packing liquid. Spoon the cooked rice into a bowl and fold in the beans just before serving.',
      ],
    },
  ]),
  dish('R12', 'Vegetable rice', { dry_rice: 80, frozen_vegetables: 150, oil: 10 }, salt, [
    {
      id: 'R12-hob',
      name: 'Hob',
      appliance: 'hob',
      tools: ['pot_with_lid', ...serving],
      water: 'Use potable water according to the rice and frozen vegetable packet instructions.',
      minutes: 32,
      steps: [
        'Cook the rice in water in the lidded pot following its packet. Spoon the cooked rice into a bowl.',
        'Cook the frozen vegetables in the same pot according to their packet. Stir the rice and oil into the cooked vegetables and heat through.',
      ],
    },
  ]),
  dish('R13', 'Potato with beans', { potato: 300, ready_beans: 200 }, salt, [
    {
      id: 'R13-microwave',
      name: 'Microwave',
      appliance: 'microwave',
      tools: ['microwave_safe_container', 'spoon', ...prep],
      water:
        'Potable water to rinse the potato and moisten the bottom of the microwave-safe container.',
      minutes: 15,
      steps: [
        'Rinse the potato and dice it on the cutting board. Put the pieces in the microwave-safe container with enough water to moisten the bottom.',
        'Microwave until tender, checking and stirring in intervals. Open the ready-to-eat beans, pour off the packing liquid and stir them into the potato.',
        'Warm the mixture through, then let it stand briefly before serving.',
      ],
    },
  ]),
  dish(
    'R14',
    'Roasted potatoes and chickpeas',
    { potato: 300, ready_chickpeas: 200, oil: 10 },
    herbs,
    [
      {
        id: 'R14-oven',
        name: 'Mini oven',
        appliance: 'mini_oven',
        tools: ['oven_safe_tray', 'spoon', ...prep],
        water: produceWater,
        minutes: 40,
        steps: [
          'Use the mini oven manual’s temperature and preheating guidance for roasting potatoes. Rinse the potatoes and cut them into small cubes on the board.',
          'Use the spoon to coat the potato with oil on the oven-safe tray. Roast until almost tender. Open and drain the ready-to-eat chickpeas.',
          'Add the chickpeas to the tray and finish roasting until the potato is tender and the chickpeas are hot.',
        ],
      },
    ],
  ),
  dish('R15', 'Vegetable soup and crackers', { vegetable_soup: 300, crackers: 60 }, {}, [
    {
      id: 'R15-microwave',
      name: 'Microwave',
      appliance: 'microwave',
      tools: ['microwave_safe_container', 'spoon'],
      minutes: 6,
      steps: [
        'Open the ready-to-heat soup and transfer it to the microwave-safe container.',
        'Microwave according to the soup label, stirring between intervals. Serve with the crackers.',
      ],
    },
    {
      id: 'R15-hob',
      name: 'Hob',
      appliance: 'hob',
      tools: ['pot_with_lid', 'spoon'],
      minutes: 10,
      steps: [
        'Open the ready-to-heat soup and pour it into a pot. Heat on the hob following the soup label, stirring occasionally.',
        'Take the soup off the heat and serve with crackers.',
      ],
    },
  ]),
  dish('R16', 'Potato and lentil pot', { potato: 250, ready_lentils: 200, carrot: 100 }, herbs, [
    {
      id: 'R16-hob',
      name: 'Hob',
      appliance: 'hob',
      tools: ['pot_with_lid', 'spoon', ...prep],
      water: 'Use potable water to rinse the vegetables and enough to cover them in the pot.',
      minutes: 26,
      steps: [
        'Rinse the potato and carrot and cut them into small pieces on the board. Put the vegetables in the pot and add water to cover.',
        'Simmer with the lid until the vegetables are tender. Open and drain the ready-to-eat lentils, add them to the pot and heat through.',
      ],
    },
  ]),
]
