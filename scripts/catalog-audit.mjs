import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const vite = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, watch: null },
})

const summarize = (rows) => ({
  recipes: rows.map((row) => row.recipe.id),
  families: [...new Set(rows.map((row) => row.recipe.familyId))].sort(),
})
const counts = (group) => group.recipes.length + ' / ' + group.families.length
const list = (ids) => ids.map((id) => id.replaceAll('_', ' ')).join(', ')
const md = [
  '# Catalog compatibility · NoKitchen 1.3',
  '',
  'This fixture uses the expanded opening inventory and the unedited eight households. Each Monday pickup covers Monday through Thursday. The Friday pickup covers Friday through Sunday. Each independent check starts with all received stock and tests one batch for the entire household. The selected joint plan shares this same finite stock across the week.',
  '',
  '## Independent compatibility and actual allocations',
  '',
  'Each pair shows distinct recipes / distinct families. Main combines lunch and dinner. The weekly column counts the recipes and families that actually occur in the selected weekly plan for that household and category. The JSON contains all seven days, the groups of recipe and family IDs, individual allocated slots and the exact witness lots for each method.',
  '',
  '| Household | Day | Category | Catalog | Kitchen method | Full independent batch | Allocated that day | Allocated that week |',
  '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
]

try {
  const load = (path) => vite.ssrLoadModule('/src/' + path + '.ts')
  const { createSeed } = await load('application/state')
  const { snapshotOf } = await load('application/selectors')
  const { catalogRows, declaredDiets } = await load('data/catalogCompatibility')
  const { auditRecipe } = await load('domain/audit')
  const { recipeAllergens } = await load('domain/validation')
  const { snapshotFingerprint, allocationDigest } = await load('domain/fingerprint')
  const { assessRecipe, validatePlan } = await load('domain/engine')
  const { DAYS, collectionForDay } = await load('domain/types')

  const state = createSeed()
  const snapshot = snapshotOf(state)
  const plan = state.draft
  assert.deepEqual(validatePlan(snapshot, plan), [])
  const days = []
  for (const household of snapshot.households) {
    for (const [day, name] of DAYS.entries()) {
      const rows = catalogRows(snapshot, household, day, plan)
      const categories = {}
      for (const category of ['breakfast', 'main']) {
        const group = rows.filter(
          (r) => r.recipe.mealTypes.includes('breakfast') === (category === 'breakfast'),
        )
        const layers = {
          catalog: summarize(group),
          kitchen: summarize(group.filter((r) => r.kitchenMethods.length)),
          standalone: summarize(group.filter((r) => r.batch.feasible)),
          allocatedDay: summarize(group.filter((r) => r.allocated > 0)),
          allocatedWeek: summarize(group.filter((r) => r.weekPortions > 0)),
        }
        const slots = plan.allocations.filter(
          (a) =>
            a.householdId === household.id &&
            a.day === day &&
            (a.meal === 'breakfast') === (category === 'breakfast'),
        )
        categories[category] = {
          ...layers,
          daySlots: slots.map(({ meal, portions, recipeId, methodId }) => ({
            meal,
            portions,
            recipeId,
            methodId,
          })),
        }
        if (day === 0 || day === 4)
          md.push(
            '| ' +
              [household.id, name, category, ...Object.values(layers).map(counts)].join(' | ') +
              ' |',
          )
      }
      days.push({
        householdId: household.id,
        day,
        name,
        people: household.peopleCount,
        collection: DAYS[collectionForDay(day)],
        ...categories,
      })
    }
  }
  md.push(
    '',
    '## Limited kitchens',
    '',
    'H01 has one person, no cooking appliance, no can opener and ambient storage only. H02 has two people, a kettle, an opener and ambient storage only. These are their actual independently feasible families on the two pickup days.',
    '',
  )
  for (const row of days.filter(
    (d) => ['H01', 'H02'].includes(d.householdId) && [0, 4].includes(d.day),
  )) {
    assert(
      row.breakfast.standalone.families.length >= 2 && row.main.standalone.families.length >= 4,
    )
    md.push(
      '- **' +
        row.householdId +
        ' · ' +
        row.name +
        '**. Breakfast (' +
        row.breakfast.standalone.families.length +
        ') includes ' +
        list(row.breakfast.standalone.families) +
        '. Main (' +
        row.main.standalone.families.length +
        ') includes ' +
        list(row.main.standalone.families) +
        '.',
    )
  }
  const recipes = snapshot.recipes.map((recipe) => {
    const audited = auditRecipe(snapshot, recipe)
    assert(audited.passed, recipe.id)
    const methods = recipe.methods.map((method) => {
      const only = { ...recipe, methods: [method] }
      for (const day of [0, 4]) {
        for (const household of snapshot.households) {
          const checked = assessRecipe(snapshot, household, only, day)
          if (checked.feasible)
            return {
              ...method,
              witness: {
                householdId: household.id,
                day: DAYS[day],
                people: household.peopleCount,
                reservations: checked.reservations,
              },
            }
        }
      }
      throw new Error('No feasible batch for ' + method.id)
    })
    return {
      ...recipe,
      methods,
      allergens: recipeAllergens(recipe, snapshot.ingredients),
      diets: declaredDiets(recipe, snapshot.ingredients),
    }
  })
  md.push(
    '',
    '## Family index and reproducibility',
    '',
    '| Recognizable meal family | Recipes |',
    '| --- | --- |',
  )
  const families = [...new Set(recipes.map((r) => r.familyId))].sort()
  for (const family of families)
    md.push(
      '| ' +
        list([family]) +
        ' | ' +
        recipes
          .filter((r) => r.familyId === family)
          .map((r) => r.id + ' ' + r.name)
          .join(', ') +
        ' |',
    )
  md.push(
    '',
    'Run `node scripts/catalog-audit.mjs` from the extracted project. The matrix uses the same recipe and method checks as Recipes. [Machine-readable results](catalog-compatibility-1.3.json).',
    '',
  )
  const output = {
    fixture: 'NoKitchen 1.3 expanded opening inventory; fresh selected weekly plan',
    householdCount: snapshot.households.length,
    snapshotFingerprint: snapshotFingerprint(snapshot),
    allocationDigest: allocationDigest(plan),
    coverage: plan.metrics,
    winner: plan.selection.winner,
    ingredients: snapshot.ingredients,
    openingLots: snapshot.lots,
    recipes,
    families,
    days,
  }
  await writeFile(
    new URL('../docs/catalog-compatibility-1.3.json', import.meta.url),
    JSON.stringify(output, null, 2) + '\n',
  )
  await writeFile(new URL('../docs/catalog-compatibility-1.3.md', import.meta.url), md.join('\n'))
  console.log(
    JSON.stringify({
      recipes: recipes.length,
      methods: recipes.reduce((sum, r) => sum + r.methods.length, 0),
      families: families.length,
      coverage: plan.metrics,
      digest: output.allocationDigest,
      rows: days.length,
    }),
  )
} finally {
  await vite.close()
}
