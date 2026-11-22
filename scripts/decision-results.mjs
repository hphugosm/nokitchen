// Deterministic release evidence. Two receipt branches start from the same reviewed offer.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

const vite = await createServer({
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
})
try {
  const load = (name) => vite.ssrLoadModule(name + '.ts')
  const { reviewedPouches } = await load('/tests/fixtures/pouchReceipt')
  const { snapshotOf, reservedByLot } = await load('/src/application/selectors')
  const { latestImpact, previewPaste } = await load('/src/application/donorCommands')
  const { assignmentChanges, boxIngredientTrace } = await load('/src/domain/impactTrace')
  const { comparePlanChanges, improveVariety } = await load('/src/domain/selection')
  const { varietyReport, classifyVarietyEffect } = await load('/src/domain/variety')
  const { runPlanner } = await load('/src/domain/allocation')
  const { validatePlan } = await load('/src/domain/validatePlan')
  const { DAYS } = await load('/src/domain/types')
  const { allocationDigest } = await load('/src/domain/fingerprint')
  const example = reviewedPouches(true),
    source = snapshotOf(example.reviewed),
    before = example.reviewed.approved
  assert.deepEqual(validatePlan(source, before), [])
  const name = (id) => source.recipes.find((r) => r.id === id).name
  const label = (a) => a && { recipe: name(a.recipeId), method: a.methodId, portions: a.portions }
  function describe(impact, plan, snapshot) {
    const changes = assignmentChanges(impact.before, plan)
    const counts = Object.fromEntries(
      ['filled', 'removed', 'changed', 'unchanged'].map((kind) => [
        kind,
        changes.filter((c) => c.kind === kind).length,
      ]),
    )
    const validation = validatePlan(snapshot, plan)
    assert.deepEqual(validation, [])
    const deltas = comparePlanChanges(impact.before, plan)
    const trace = boxIngredientTrace(
      snapshot,
      impact.before,
      plan,
      'H02',
      4,
      impact.items[0].lot.ingredientId,
      impact.items,
    )
    return {
      portions: plan.metrics.allocated,
      filledSlots: plan.allocations.length,
      counts,
      recipeOrMethodChanges: deltas.changed.length,
      householdPortions: deltas.deltas,
      context: plan.selection.context,
      winner: plan.selection.winner,
      allocationDigest: allocationDigest(plan),
      validation,
      meals: changes
        .filter((c) => c.kind !== 'unchanged')
        .map((c) => ({
          household: c.householdId,
          day: DAYS[c.day],
          meal: c.meal,
          kind: c.kind,
          before: label(c.before),
          after: label(c.after),
        })),
      fridayH02: {
        ...trace,
        lines: trace.lines.map((line) => ({
          ...line,
          day: DAYS[line.day],
          recipe: name(line.recipeId),
        })),
      },
    }
  }
  const receiptBranches = []
  for (const approved of [true, false]) {
    const fixture = approved ? example : reviewedPouches(false)
    const preview = previewPaste(fixture.reviewed, fixture.id)
    const offered = {
      mode: 'If received as entered',
      key: preview.key,
      baseline: preview.decision.baselineDigest,
      status: preview.decision.baselineStatus,
      offeredPouches: preview.items[0].lot.packageCount,
      recommended: preview.decision.recommended,
      keep: allocationDigest(preview.decision.keep),
      coverage: allocationDigest(preview.decision.coverage),
    }
    for (const count of [12, 8]) {
      const state = fixture.receive(count),
        snapshot = snapshotOf(state),
        impact = latestImpact(state)
      assert.deepEqual(reservedByLot(state.approved), reservedByLot(fixture.reviewed.approved))
      const { decision } = impact
      const keep = describe(impact, decision.keep, snapshot),
        coverage = describe(impact, decision.coverage, snapshot)
      if (count === offered.offeredPouches) {
        assert.equal(keep.allocationDigest, offered.keep)
        assert.equal(coverage.allocationDigest, offered.coverage)
      }
      receiptBranches.push({
        offered,
        mode: 'Actual receipt draft',
        key: impact.key,
        appliedPouches: impact.items[0].lot.packageCount,
        receipt: impact.items[0],
        rule: decision.ruleId,
        baselineDigest: decision.baselineDigest,
        baselineStatus: decision.baselineStatus,
        recommended: decision.recommended,
        selected: decision.selected,
        keep,
        coverage,
      })
    }
  }
  function householdComparison(base, result) {
    const prior = varietyReport(source, base),
      next = varietyReport(source, result)
    return {
      beforeScore: prior.score,
      afterScore: next.score,
      households: prior.households.map((h, i) => {
        const matched = next.households[i]
        const category = (cat) => ({
          before: h[cat],
          after: matched[cat],
          effect: classifyVarietyEffect(h[cat], matched[cat]),
        })
        return { id: h.householdId, breakfast: category('breakfast'), main: category('main') }
      }),
    }
  }
  const improved = improveVariety(source, before).plan,
    raw = runPlanner(source, 'nokitchen'),
    reference = runPlanner(source, 'reference-first-fit')
  assert.deepEqual(validatePlan(source, reference), [])
  const moves = comparePlanChanges(before, improved)
  assert.deepEqual(validatePlan(source, improved), [])
  assert.equal(moves.lost.length + moves.filled.length, 0)
  assert.ok(moves.changed.every((m) => m.fromPortions === m.toPortions))
  const evidence = {
    release: '1.4.1',
    modelWeek: example.reviewed.weekStart,
    sourceDigest: allocationDigest(before),
    catalog: {
      ingredients: source.ingredients.length,
      recipes: source.recipes.length,
      methods: source.recipes.reduce((n, r) => n + r.methods.length, 0),
      families: new Set(source.recipes.map((r) => r.familyId)).size,
    },
    freshReference: { strategy: reference.strategy, metrics: reference.metrics, validation: [] },
    baseline: { filledSlots: before.allocations.length, metrics: before.metrics },
    rawToStartingH01: householdComparison(raw, before).households.find((h) => h.id === 'H01'),
    improveVariety: {
      ...householdComparison(before, improved),
      changes: moves,
      validation: validatePlan(source, improved),
    },
    receiptBranches,
  }
  await writeFile('docs/decision-results-1.4.1.json', JSON.stringify(evidence, null, 2) + '\n')
  console.log(
    'Wrote evidence for',
    receiptBranches.length,
    'receipt branches and',
    evidence.improveVariety.households.length,
    'households.',
  )
} finally {
  await vite.close()
}
