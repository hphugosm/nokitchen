// Reproduce the historical control, expanded week, fixed-coverage search, and real donor receipt.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))
const vite = await createServer({
  root,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
})
const load = (name, base = '/src/') => vite.ssrLoadModule(base + name + '.ts')
try {
  await mkdir('dist/legacy-evidence', { recursive: true })
  const frozen = (name) => load(name, '/tests/frozen12/src/')
  const { createSeed: oldSeed, applyAction: oldAction } = await frozen('application/state')
  const { snapshotOf: oldSnapshot } = await frozen('application/selectors')
  const { runPlanner: oldRaw, validatePlan: oldValidate } = await frozen('domain/engine')
  const { selectPlan: oldSelect, comparePlanChanges: oldDiff } = await frozen('domain/selection')
  const { planningOptions: oldOptions } = await frozen('domain/policyTypes')
  const old = oldSeed(),
    original = oldSnapshot(old)
  const opener = {
    ...original,
    revision: 2,
    households: original.households.map((h) =>
      h.id === 'H01' ? { ...h, tools: [...h.tools, 'can_opener'] } : h,
    ),
  }
  let donated = old
  for (const step of ['load', 'review', 'receive'])
    donated = oldAction(donated, { type: 'offer', id: 'OFFER-01', step })
  const os = oldSnapshot(donated),
    op = oldSelect(os, oldOptions(old.draft))
  const plus = oldSelect({ ...os, revision: 3, households: opener.households }, oldOptions(op))
  const reduced = {
    ...original,
    revision: 2,
    lots: original.lots.map((l) =>
      l.ingredientId === 'instant_couscous' ? { ...l, quantityBaseUnits: 0 } : l,
    ),
  }
  const frozen12 = {
    ingredients: original.ingredients.length,
    recipes: original.recipes.length,
    engineVersion: old.draft.selection.context.engineVersion,
    seed: old.draft.metrics.allocated,
    reference: oldRaw(original, 'reference-first-fit').metrics.allocated,
    openerRaw: oldRaw(opener, 'nokitchen').metrics.allocated,
    openerSelected: oldSelect(opener, oldOptions(old.draft)).metrics.allocated,
    donationRaw: oldRaw(os, 'nokitchen').metrics.allocated,
    donationSelected: op.metrics.allocated,
    donationFilled: oldDiff(old.draft, op).filled,
    donationThenOpener: plus.metrics.allocated,
    couscousRemoved: oldSelect(reduced, oldOptions(old.draft)).metrics.allocated,
    validation: oldValidate(os, op),
  }
  assert.deepEqual(
    [
      frozen12.seed,
      frozen12.reference,
      frozen12.openerRaw,
      frozen12.openerSelected,
      frozen12.donationRaw,
      frozen12.donationSelected,
      frozen12.donationThenOpener,
      frozen12.couscousRemoved,
    ],
    [241, 228, 239, 241, 249, 255, 255, 222],
  )

  const { catalog } = await load('data/index'),
    { createSeed, applyAction } = await load('application/state')
  const { snapshotOf } = await load('application/selectors'),
    { previewPaste, latestImpact } = await load('application/donorCommands')
  const { runPlanner, validatePlan } = await load('domain/engine'),
    { familyAwarePlan } = await load('domain/allocation')
  const { improveVariety, comparePlanChanges, compareCandidateScores } =
      await load('domain/selection'),
    { varietyReport } = await load('domain/variety')
  const { METRIC_VERSION, SEARCH_BUDGET } = await load('domain/policyTypes')
  const { controlledVarietyCase } = await load('fixtures/varietyCases', '/tests/')
  const { ManualMessageSource, sampleMessages } = await load('integrations/donations/messages'),
    { parseOffer } = await load('integrations/donations/parser')

  function outline(s, p) {
    const validation = validatePlan(s, p)
    assert.deepEqual(validation, [])
    return {
      id: p.id,
      source: p.fingerprint,
      context: p.selection?.context ?? null,
      winner: p.selection?.winner ?? p.strategy,
      metrics: p.metrics,
      variety: varietyReport(s, p),
      validation,
    }
  }
  function fixed(s, base) {
    const result = improveVariety(s, base),
      after = result.plan,
      changes = comparePlanChanges(base, after)
    assert.equal(changes.filled.length + changes.lost.length, 0)
    assert.equal(
      changes.deltas.some((h) => h.delta !== 0),
      false,
    )
    assert.equal(
      changes.changed.some((c) => c.fromPortions !== c.toPortions),
      false,
    )
    return {
      reason: result.reason,
      improved: result.improved,
      before: outline(s, base),
      after: outline(s, after),
      changes,
    }
  }

  let state = createSeed()
  const seedSnapshot = snapshotOf(state),
    base = state.draft
  const rawByKind = {
    'fresh-legacy': runPlanner(seedSnapshot, 'nokitchen'),
    'family-aware': familyAwarePlan(seedSnapshot),
  }
  const rawLeader = base.selection.candidates
    .filter((c) => c.valid && c.kind in rawByKind)
    .sort(compareCandidateScores)[0].kind
  const freshChanges = comparePlanChanges(rawByKind[rawLeader], base)
  assert.equal(base.selection.winner, 'fresh-refined')
  assert.equal(freshChanges.filled.length + freshChanges.lost.length, 0)
  assert.ok(freshChanges.changed.length > 0 && freshChanges.changed.length <= 2)
  assert.ok(freshChanges.changed.every((c) => c.fromPortions === c.toPortions))
  const freshRefinement = {
    source: rawLeader,
    before: outline(seedSnapshot, rawByKind[rawLeader]),
    after: outline(seedSnapshot, base),
    changes: freshChanges,
  }
  const expanded = {
    freshRefinement,
    ingredientCount: catalog.ingredients.length,
    recipeCount: catalog.recipes.length,
    methodCount: catalog.recipes.reduce((sum, r) => sum + r.methods.length, 0),
    familyCount: new Set(catalog.recipes.map((r) => r.familyId)).size,
    receivedLots: state.lots.length,
    initialFixed: fixed(seedSnapshot, base),
    freshLegacy: outline(seedSnapshot, rawByKind['fresh-legacy']),
    freshFamilyAware: outline(seedSnapshot, rawByKind['family-aware']),
    firstFit: outline(seedSnapshot, runPlanner(seedSnapshot, 'reference-first-fit')),
  }

  state = applyAction(state, { type: 'approve', planId: base.id })
  const text = sampleMessages.find((e) => e.id === 'pouches').text
  const message = await new ManualMessageSource(
    { text, sender: 'Test donor', subject: 'Synthetic chickpea pouches' },
    '2026-11-23T08:00:00Z',
  ).obtain()
  const id = 'release-evidence-chickpeas'
  const doc = parseOffer(message, catalog, state.weekStart, id)
  const confirmed = {
    storage: 'ambient',
    afterOpening: 'fridge',
    canRepack: false,
    requiresCanOpener: false,
    availableFromDay: 0,
    usableThroughDay: 6,
  }
  for (const [k, value] of Object.entries(confirmed)) {
    doc.rows[0][k] = value
    doc.rows[0].edits[k] = 'Operator confirmed for this synthetic demonstration.'
  }
  state = applyAction(state, { type: 'savePaste', doc, expectedVersion: null })
  state = applyAction(state, { type: 'offer', id, step: 'review', expectedVersion: 1 })
  const preview = previewPaste(state, id)
  state = applyAction(state, {
    type: 'offer',
    id,
    step: 'receive',
    actualRows: doc.rows,
    expectedVersion: 1,
  })
  assert.equal(state.approved.id, base.id)
  assert.equal(
    applyAction(state, {
      type: 'offer',
      id,
      step: 'receive',
      actualRows: doc.rows,
      expectedVersion: 1,
    }),
    state,
  )
  state = applyAction(state, { type: 'recalculate' })
  const actual = latestImpact(state),
    afterSnapshot = snapshotOf(state),
    after = actual.decision.coverage
  assert.equal(preview.decision.coverage.id, after.id)
  const changes = comparePlanChanges(base, after),
    target =
      changes.filled.find((s) => s.householdId === 'H01') ?? changes.filled[0] ?? changes.changed[0]
  assert.ok(target)
  const hh = target.householdId,
    collection = target.day < 4 ? 0 : 4
  const meal = after.allocations.find(
    (a) => a.householdId === hh && a.day === target.day && a.meal === target.meal,
  )
  const box = (p) =>
    p.packingLists.find((b) => b.householdId === hh && b.collectionDay === collection)
  const delivery = {
    message: text,
    operatorConfirmed: confirmed,
    items: actual.items,
    previewId: preview.decision.coverage.id,
    actualId: after.id,
    baseline: outline(seedSnapshot, base),
    actual: outline(afterSnapshot, after),
    changes,
    example: {
      meal,
      recipeName: catalog.recipes.find((r) => r.id === meal.recipeId).name,
      boxBefore: box(base),
      boxAfter: box(after),
    },
    fixed: fixed(afterSnapshot, after),
  }
  const controlled = {}
  for (const name of ['restricted-pair', 'equipped-single', 'no-alternative']) {
    const s = controlledVarietyCase(name)
    controlled[name] = fixed(s, runPlanner(s, 'reference-first-fit'))
  }

  const report = {
    metricVersion: METRIC_VERSION,
    searchBudget: SEARCH_BUDGET,
    frozen12,
    expanded,
    delivery,
    controlled,
  }
  await writeFile(
    root + 'dist/legacy-evidence/variety-results-1.3.json',
    JSON.stringify(report, null, 2) + '\n',
  )
  const fmt = (a) => a.join(' / ')
  const rows = expanded.initialFixed.before.variety.households.map((h, i) => {
    const a = expanded.initialFixed.after.variety.households[i]
    return [
      h.householdId,
      h.breakfast.portions + h.main.portions,
      h.breakfast.distinctFamilies + ' → ' + a.breakfast.distinctFamilies,
      h.main.distinctFamilies + ' → ' + a.main.distinctFamilies,
      fmt(h.score) + ' → ' + fmt(a.score),
    ]
  })
  const f = expanded.initialFixed,
    pf = delivery.fixed
  const freshH01 = (step) =>
    freshRefinement[step].variety.households.find((h) => h.householdId === 'H01').score
  const evidence = [
    '# NoKitchen 1.3 coverage and variety',
    '',
    '## Three separate calculations',
    '',
    'The frozen version 1.2 run used its archived 30-ingredient, 16-recipe catalog, inventory and planning code. It reproduced ' +
      frozen12.seed +
      ' / 378 portions for the selected seed and ' +
      frozen12.reference +
      ' / 378 for first fit. Opener-only raw and selected results were ' +
      frozen12.openerRaw +
      ' and ' +
      frozen12.openerSelected +
      '. The Monday fixture raised selected allocation to ' +
      frozen12.donationSelected +
      ' from a raw ' +
      frozen12.donationRaw +
      ', adding ' +
      frozen12.donationFilled.length +
      ' household meal slots. The opener after receipt kept ' +
      frozen12.donationThenOpener +
      '. Removing couscous stock gave ' +
      frozen12.couscousRemoved +
      '.',
    '',
    'The expanded synthetic week contains ' +
      expanded.ingredientCount +
      ' ingredients, ' +
      expanded.recipeCount +
      ' recipes, ' +
      expanded.methodCount +
      ' methods, ' +
      expanded.familyCount +
      ' families and ' +
      expanded.receivedLots +
      ' lots. The legacy greedy candidate covered ' +
      expanded.freshLegacy.metrics.allocated +
      ' portions and the family-aware candidate covered ' +
      expanded.freshFamilyAware.metrics.allocated +
      '. The selected ' +
      f.before.winner +
      ' candidate covered ' +
      f.before.metrics.allocated +
      ' of ' +
      f.before.metrics.requested +
      '. These expanded totals include the additional inventory and recipes.',
    '',
    'For a fresh plan, one bounded refinement of the leading validated candidate can compete. Its source was ' +
      freshRefinement.source +
      '. At identical filled slots and portion counts, the system score changed from ' +
      fmt(freshRefinement.before.variety.score) +
      ' to ' +
      fmt(freshRefinement.after.variety.score) +
      '. Restricted household H01 improved from ' +
      fmt(freshH01('before')) +
      ' to ' +
      fmt(freshH01('after')) +
      '. This initial refinement accepts at most one single or paired move. Ordinary recalculation with an incumbent prioritizes the stability of previously assigned meals.',
    '',
    'The fixed-slot experiment kept that same 1.3 snapshot, households, requests, equipment, assigned slots and portion counts. The system score changed from ' +
      fmt(f.before.variety.score) +
      ' to ' +
      fmt(f.after.variety.score) +
      '. The pass changed ' +
      f.changes.changed.length +
      ' recipes or methods. It removed zero filled meals.',
    '',
    '| Household | Portions held fixed | Breakfast families | Main families | Score before → after |',
    '|---|---:|---:|---:|---|',
    ...rows.map((row) => '| ' + row.join(' | ') + ' |'),
    '',
    '## Metric and search',
    '',
    'The three integer scores in each row are family collisions, adjacent same-family meals and exact-recipe collisions. Lower wins lexicographically. Each family or recipe used n times contributes n × (n − 1) / 2 pairs. Breakfast forms one sequence. Lunch and dinner together form a second chronological sequence. Unfilled slots are omitted, so a gap never resets adjacency. We sum over both sequences of each household, then sum over households. These software measures describe repetition.',
    '',
    'The family-aware fresh candidate ranks feasible recipes by the marginal increase in that score before expiry, scarcity and recipe ID. Ordinary selection still ranks total portions, minimum household coverage and incumbent stability first. Explicit Improve variety holds the original filled slots and portion counts fixed. It tests single slots and same-household pairs using temporary ledgers, a shortlist of three alternative recipes per side plus a direct swap, two passes and at most ' +
      SEARCH_BUDGET +
      ' atomic feasibility trials shared across households. Within the tested moves, lower household score precedes fewer changed assignments. Every accepted move and the resulting draft pass the full plan validator. A bounded search can miss other feasible improvements.',
    '',
    '## Reviewed chickpea delivery',
    '',
    'The pasted example offered twelve sealed pouches with 200 g edible contents each. The operator confirmed ambient storage before opening, refrigeration after opening, whole-package issue, opener-free access and the Monday–Sunday model window. Review and preview changed no physical stock. Receipt added ' +
      actual.items[0].lot.quantityBaseUnits +
      ' g. Recalculation matched the preview and kept the prior approval active.',
    '',
    'Coverage changed from ' +
      base.metrics.allocated +
      ' to ' +
      after.metrics.allocated +
      ' of ' +
      after.metrics.requested +
      ' portions. Uncovered portions changed from ' +
      base.metrics.uncovered +
      ' to ' +
      after.metrics.uncovered +
      '. ' +
      changes.filled.length +
      ' slots were newly filled, ' +
      changes.lost.length +
      ' were lost and ' +
      changes.changed.length +
      ' other assignments changed recipes or methods. The JSON records each household delta and both exact collection boxes for the example meal.',
    '',
    'Example meal: ' +
      hh +
      ', ' +
      ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][meal.day] +
      ' ' +
      meal.meal +
      ', ' +
      delivery.example.recipeName +
      ' (' +
      meal.portions +
      ' model portion' +
      (meal.portions === 1 ? '' : 's') +
      '). After receipt, explicit variety improvement kept ' +
      after.metrics.allocated +
      ' portions and changed the system score from ' +
      fmt(pf.before.variety.score) +
      ' to ' +
      fmt(pf.after.variety.score) +
      '.',
    '',
    '## Controlled checks',
    '',
    '| Test household and supplies | Portions held fixed | Score before → after |',
    '|---|---:|---|',
    ...Object.entries(controlled).map(
      ([name, c]) =>
        '| ' +
        name +
        ' | ' +
        c.before.metrics.allocated +
        ' | ' +
        fmt(c.before.variety.score) +
        ' → ' +
        fmt(c.after.variety.score) +
        ' |',
    ),
    '',
    'The restricted-pair control uses the unmodified H01 kitchen and explicitly supplied opener-free lentils. Two salads followed by two wraps exhaust both ingredient sets, so only a paired exchange can improve their order. The equipped control uses H03’s existing microwave and fridge, with enough alternate breakfast ingredients for single replacements. The last control supplies one feasible recipe and correctly reports no improvement.',
    '',
    'Run `node scripts/variety-results.mjs` to regenerate this report and its [machine-readable evidence](variety-results-1.3.json).',
    '',
  ]
  await writeFile(root + 'dist/legacy-evidence/variety-results-1.3.md', evidence.join('\n'))
  console.log(
    'Frozen',
    frozen12.seed,
    'expanded',
    base.metrics.allocated,
    'received',
    after.metrics.allocated,
    'changed meals',
    f.changes.changed.length,
    'example',
    hh,
    meal.day,
    meal.meal,
    delivery.example.recipeName,
  )
} finally {
  await vite.close()
}
