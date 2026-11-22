// All entries describe the synthetic variants. Aliases help identify a product;
// donors still confirm delivery, storage, package access and usable quantities.
type ProductLabel = { aliases: string[]; basis: string; description?: string }
const dry = 'Dry product weight, excluding its package.'
const edible = 'Edible food weight, excluding wrapping and inedible parts.'
const drained = 'Drained edible solids, excluding packing liquid and container.'
const liquid = 'Usable liquid volume, excluding its container.'

export const productLabels: Record<string, ProductLabel> = {
  oats: {
    aliases: ['rolled oats', 'ovesné vločky'],
    basis: dry,
    description:
      'Rolled oats labeled for cooked or cold use. Retain the product cooking directions with every repacked portion.',
  },
  instant_couscous: {
    aliases: ['instant couscous', 'instantní kuskus'],
    basis: dry,
    description:
      'Instant precooked grains with hydration proportions and standing time supplied with each measured portion.',
  },
  dry_rice: {
    aliases: ['uncooked rice', 'dry rice', 'suchá rýže'],
    basis: dry,
    description: 'Uncooked rice. Its absorption-cooking directions accompany each portion.',
  },
  dry_pasta: {
    aliases: ['pasta', 'dry pasta', 'těstoviny'],
    basis: dry,
    description: 'Dry pasta with boiling directions provided for repacked portions.',
  },
  bread: {
    aliases: ['sliced bread', 'chléb', 'chleba'],
    basis: edible,
    description: 'Sliced bread suitable for portioning by weight.',
  },
  tortilla: {
    aliases: ['tortillas', 'tortilly'],
    basis: 'Individual whole tortilla, counted by piece.',
  },
  potato: { aliases: ['potatoes', 'brambory'], basis: edible },
  crackers: { aliases: ['crackers', 'krekry'], basis: edible },
  ready_chickpeas: {
    aliases: ['ready-to-eat chickpeas', 'cooked chickpeas', 'vařená cizrna'],
    basis: drained,
  },
  ready_beans: {
    aliases: ['ready-to-eat beans', 'cooked beans', 'vařené fazole'],
    basis: drained,
  },
  ready_lentils: {
    aliases: ['ready-to-eat lentils', 'cooked lentils', 'vařená čočka'],
    basis: drained,
  },
  sweetcorn: {
    aliases: ['sweet corn', 'sladká kukuřice'],
    basis: drained,
    description: 'Canned, cooked sweetcorn labeled ready to eat.',
  },
  canned_tuna: { aliases: ['canned tuna', 'tuňák v konzervě'], basis: drained },
  uht_milk: {
    aliases: ['long-life cow milk', 'trvanlivé mléko'],
    basis: liquid,
  },
  yogurt: { aliases: ['yoghurt', 'jogurt'], basis: edible },
  cheese: { aliases: ['cheese', 'sýr'], basis: edible },
  carrot: { aliases: ['carrots', 'mrkev'], basis: edible },
  tomato: { aliases: ['tomatoes', 'rajčata'], basis: edible },
  cucumber: { aliases: ['cucumbers', 'okurka'], basis: edible },
  apple: { aliases: ['apples', 'jablka'], basis: edible },
  banana: { aliases: ['bananas', 'banány'], basis: edible },
  frozen_vegetables: {
    aliases: ['frozen mixed vegetables', 'mražená zelenina'],
    basis: edible,
  },
  raisins: { aliases: ['raisins', 'rozinky'], basis: edible },
  passata: { aliases: ['passata', 'pasírovaná rajčata'], basis: edible },
  oil: { aliases: ['cooking oil', 'rostlinný olej'], basis: liquid },
  peanut_butter: {
    aliases: ['peanut butter', 'arašídové máslo'],
    basis: edible,
  },
  salt: { aliases: ['table salt', 'sůl'], basis: dry },
  dried_herbs: { aliases: ['dried herbs', 'sušené bylinky'], basis: dry },
  cinnamon: { aliases: ['ground cinnamon', 'skořice'], basis: dry },
  vegetable_soup: {
    aliases: ['prepared vegetable soup', 'hotová zeleninová polévka'],
    basis: liquid,
    description: 'Ready-to-heat vegetable soup used at full strength.',
  },
  ready_rice: {
    aliases: ['ready-to-eat rice', 'cooked rice pouch', 'vařená rýže'],
    basis: 'Cooked edible rice weight, without packaging.',
    description:
      'Sterilized tear-open rice pouch. This fixture is shelf-stable unopened and labeled for cold use immediately after opening.',
  },
  potato_flakes: {
    aliases: ['instant potato flakes', 'bramborové vločky'],
    basis: dry,
    description:
      'Plain instant flakes prepared with heated potable water only. Supply the labeled water ratio and standing time with each measured portion.',
  },
  red_lentils: {
    aliases: ['dry red lentils', 'suchá červená čočka'],
    basis: dry,
    description:
      'Dry split red lentils requiring cooking. Provide the product cooking directions with each measured portion.',
  },
  ready_beetroot: {
    aliases: ['ready-to-eat beetroot', 'vařená řepa'],
    basis: 'Edible cooked beetroot without packaging or packing liquid.',
    description:
      'Soft cooked pieces, retort-packed for ambient storage unopened. Tear open and use the whole pack.',
  },
  hummus: {
    aliases: ['hummus', 'cizrnová pomazánka'],
    basis: edible,
    description:
      'A synthetic retort-treated, shelf-stable tear-open portion containing sesame. Ordinary chilled tubs have different storage needs.',
  },
  sardines: {
    aliases: ['canned sardines', 'sardinky v konzervě'],
    basis: drained,
    description: 'Fully cooked, boneless ready-to-eat fish in a pull-tab can.',
  },
  sweet_potato: { aliases: ['sweet potatoes', 'batáty'], basis: edible },
  ready_peas: {
    aliases: ['cooked peas', 'vařený hrášek'],
    basis: drained,
    description: 'Cooked peas in a pull-tab can, ready to serve.',
  },
  cabbage: { aliases: ['white cabbage', 'bílé zelí'], basis: edible },
  bell_pepper: { aliases: ['bell peppers', 'sladká paprika'], basis: edible },
  onion: { aliases: ['onions', 'cibule'], basis: edible },
  spinach: {
    aliases: ['spinach leaves', 'špenátové listy'],
    basis: edible,
    description: 'Fresh spinach leaves kept refrigerated until use.',
  },
  pear: { aliases: ['pears', 'hrušky'], basis: edible },
  orange: { aliases: ['oranges', 'pomeranče'], basis: edible },
  dried_apricots: {
    aliases: ['dried apricots', 'sušené meruňky'],
    basis: edible,
    description: 'Pitted pieces. This sample label declares sulphites.',
  },
  sunflower_spread: {
    aliases: ['sunflower seed butter', 'slunečnicová pomazánka'],
    basis: edible,
    description: 'Smooth sunflower seed spread in a single-use sachet.',
  },
  jam: { aliases: ['fruit jam', 'džem'], basis: edible },
  oat_drink: {
    aliases: ['UHT oat drink', 'trvanlivý ovesný nápoj'],
    basis: liquid,
    description:
      'An unopened ambient UHT oat drink. This variant declares gluten and has no dairy ingredient.',
  },
  apple_puree: {
    aliases: ['apple puree', 'jablečné pyré'],
    basis: edible,
    description: 'Pasteurized, ready-to-eat fruit puree in a single-use ambient pouch.',
  },
  rice_cereal: {
    aliases: ['puffed rice cereal', 'rýžové pukance'],
    basis: dry,
    description: 'Ready-to-eat puffed rice with no further cooking required.',
  },
}
