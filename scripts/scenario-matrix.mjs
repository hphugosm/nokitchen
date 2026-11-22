// Build the release evidence from the application's TypeScript domain and state commands.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { cpus } from 'node:os'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const vite = await createServer({
  root: projectRoot,
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
})

const repetitions = 9
function measure(compute) {
  compute() // Warm this scenario and strategy before collecting wall-clock samples.
  const samples = []
  let plan
  for (let i = 0; i < repetitions; i++) {
    const start = performance.now()
    plan = compute()
    samples.push(performance.now() - start)
  }
  samples.sort((a, b) => a - b)
  return { plan, medianMs: Number(samples[Math.floor(samples.length / 2)].toFixed(2)) }
}

function deltaText(n) {
  return n > 0 ? '+' + n : String(n)
}
function markdown(report) {
  const text = [
    '# Scenario matrix · NoKitchen 1.2',
    '',
    'All values are model recipe portions. Reference and raw are fresh runs from identical received stock. Selection uses the named incumbent when supplied. Each selection was checked against its current inputs. Times are median wall-clock milliseconds for ' +
      repetitions +
      ' measured runs after one warm-up in Node ' +
      process.version +
      '.',
    '',
    '| Scenario and mode | Reference | Raw | Incumbent | Selected / demand | Winning candidate | Target before → after | Checks | Selection ms |',
    '| --- | ---: | ---: | --- | ---: | --- | --- | --- | ---: |',
  ]
  for (const r of report.rows) {
    const incumbent = r.incumbent
      ? r.incumbent.portions + ' · ' + (r.incumbent.valid ? 'valid' : 'invalid')
      : 'None'
    text.push(
      '| ' +
        [
          r.name + ' · ' + r.mode,
          r.reference.portions,
          r.raw.portions,
          incumbent,
          r.selected.portions + ' / ' + r.requested,
          r.selected.winner,
          r.target.id + ' ' + r.target.before + ' → ' + r.target.after,
          'Passed',
          r.timing.selectedMedianMs,
        ].join(' | ') +
        ' |',
    )
  }
  text.push(
    '',
    '## Household changes',
    '',
    'Deltas compare selection with the supplied incumbent, or with the reference on fresh runs. Zero includes a household that kept the same number of portions. Percentage-point and slot-level changes, additional reference comparisons, and validator evidence are recorded in the JSON.',
    '',
    '| Scenario | Basis | ' + report.householdIds.join(' | ') + ' |',
    '| --- | --- | ' + report.householdIds.map(() => '---:').join(' | ') + ' |',
  )
  for (const r of report.rows) {
    text.push(
      '| ' +
        [
          r.name,
          r.changeBasis,
          ...report.householdIds.map((id) => {
            const found = r.changes.deltas.find((h) => h.householdId === id)
            return found ? deltaText(found.delta) : '—'
          }),
        ].join(' | ') +
        ' |',
    )
  }
  text.push(
    '',
    '## Reproducible inputs',
    '',
    'The policy is Meal coverage first. The policy parameters, snapshot fingerprints, allocation digests and scores for every candidate are retained in [the machine-readable matrix](scenario-results-1.2.json). Formula, lot declarations and scenario inputs come from the same code as the application.',
    '',
    '| Scenario | Policy context key | Input change |',
    '| --- | --- | --- |',
  )
  for (const r of report.rows)
    text.push('| ' + r.name + ' | `' + r.context.key + '` | ' + r.description + ' |')
  text.push(
    '',
    'Run `npm run matrix` to regenerate both files. Timings vary by machine and load.',
    '',
  )
  return text.join('\n')
}

try {
  const load = (path) => vite.ssrLoadModule('/tests/frozen12/src/' + path + '.ts')
  const { createSeed, applyAction } = await load('application/state')
  const { snapshotOf } = await load('application/selectors')
  const { selectPlan, comparePlanChanges } = await load('domain/selection')
  const { planningOptions } = await load('domain/policyTypes')
  const { runPlanner, validatePlan, assessRecipe } = await load('domain/engine')
  const { teachingScenario, applyHypothesis } = await load('domain/analysis')
  const { allocationDigest } = await load('domain/fingerprint')

  const seedState = createSeed()
  const seed = snapshotOf(seedState)
  let donationState = seedState
  for (const step of ['load', 'review', 'receive']) {
    donationState = applyAction(donationState, { type: 'offer', id: 'OFFER-01', step })
  }
  const donation = snapshotOf(donationState)
  const h01Opener = (s) =>
    applyHypothesis(s, 'H01', {
      kind: 'can_opener',
      id: 'matrix-opener',
      label: 'Add a can opener',
    })
  const seedPlan = selectPlan(seed, planningOptions())
  const donationPlan = selectPlan(donation, planningOptions(seedPlan))
  const reduced = snapshotOf(
    applyAction(seedState, { type: 'stock', lotId: 'LOT-002', quantity: 0 }),
  )
  const microwave = applyHypothesis(seed, 'H01', {
    kind: 'appliance',
    applianceId: 'microwave',
    id: 'matrix-microwave',
    label: 'Add a microwave',
  })
  const h01 = microwave.households.find((h) => h.id === 'H01')
  const recipe = microwave.recipes.find((r) => r.id === 'R13')
  const check = assessRecipe(microwave, h01, recipe, 0)
  assert(
    check.reasons.some(
      (r) => r.code === 'MISSING_TOOL' && /microwave.safe.container/i.test(r.message),
    ),
  )
  const cases = [
    [
      'initial',
      'Untouched full week',
      'Reset fixture with all original inputs.',
      seed,
      null,
      'H01',
    ],
    [
      'monday-donation',
      'Monday donation',
      'Review and receive OFFER-01 once, using the selected initial plan as history.',
      donation,
      seedPlan,
      'H01',
    ],
    [
      'opener-only',
      'Opener only',
      'Add only a can opener to H01 on the initial stock.',
      h01Opener(seed),
      seedPlan,
      'H01',
    ],
    [
      'donation-then-opener',
      'Donation then opener',
      'Add only a can opener to H01 after the Monday receipt and its selected draft.',
      h01Opener(donation),
      donationPlan,
      'H01',
    ],
    [
      'teaching',
      'Teaching pair',
      'Two one-person Monday lunch requests competing for one kettle meal.',
      teachingScenario(seed, 'teaching'),
      null,
      'H02',
    ],
    [
      'neutral',
      'Neutral pair',
      'Both Monday lunch requests have suitable stock in this separate example.',
      teachingScenario(seed, 'neutral'),
      null,
      'H02',
    ],
    [
      'invalid',
      'Invalid incumbent',
      'Reduce the received couscous lot LOT-002 to zero before approval. The old assignments use this lot.',
      reduced,
      seedPlan,
      'H02',
    ],
    [
      'tool-blocker',
      'Microwave without container',
      'Add a microwave to H01 only. The R13 microwave-safe container remains missing.',
      microwave,
      seedPlan,
      'H01',
    ],
  ]
  const rows = []
  for (const [id, name, description, snapshot, incumbent, targetId] of cases) {
    const inputs = JSON.stringify(snapshot)
    const reference = measure(() => runPlanner(snapshot, 'reference-first-fit'))
    const raw = measure(() => runPlanner(snapshot, 'nokitchen'))
    const selected = measure(() => selectPlan(snapshot, planningOptions(incumbent)))
    const audit = {
      reference: validatePlan(snapshot, reference.plan),
      raw: validatePlan(snapshot, raw.plan),
      selected: validatePlan(snapshot, selected.plan),
    }
    for (const [label, errors] of Object.entries(audit))
      assert.deepEqual(errors, [], id + ' ' + label + ' validation')
    assert.equal(JSON.stringify(snapshot), inputs)
    const evidence = selected.plan.selection
    const retained = evidence.candidates.find((c) => c.kind === 'retain')
    if (incumbent) {
      assert(retained, 'Missing incumbent assessment')
      assert.equal(retained.valid, id !== 'invalid', id + ' incumbent validity')
      if (retained.valid) assert(selected.plan.metrics.allocated >= incumbent.metrics.allocated)
    }
    const basis = incumbent ?? reference.plan
    const changes = comparePlanChanges(basis, selected.plan)
    const target = changes.deltas.find((r) => r.householdId === targetId)
    assert(target)
    assert.equal(
      changes.deltas.reduce((total, r) => total + r.delta, 0),
      selected.plan.metrics.allocated - basis.metrics.allocated,
    )
    rows.push({
      id,
      name,
      description,
      mode: incumbent ? 'with incumbent' : 'fresh',
      context: evidence.context,
      requested: selected.plan.metrics.requested,
      reference: {
        portions: reference.plan.metrics.allocated,
        digest: allocationDigest(reference.plan),
      },
      raw: { portions: raw.plan.metrics.allocated, digest: allocationDigest(raw.plan) },
      incumbent: incumbent
        ? {
            portions: incumbent.metrics.allocated,
            digest: allocationDigest(incumbent),
            valid: retained.valid,
            issues: retained.issues,
          }
        : null,
      selected: {
        portions: selected.plan.metrics.allocated,
        winner: evidence.winner,
        digest: allocationDigest(selected.plan),
        reason: evidence.reason,
      },
      candidates: evidence.candidates,
      changeBasis: incumbent ? 'Incumbent' : 'Reference',
      target: {
        id: targetId,
        before: target.before,
        after: target.after,
        delta: target.delta,
        percentagePoints: target.percentagePoints,
      },
      changes,
      changesFromReference: comparePlanChanges(reference.plan, selected.plan),
      validation: audit,
      blockers: id === 'tool-blocker' ? check.reasons : [],
      timing: {
        referenceMedianMs: reference.medianMs,
        rawMedianMs: raw.medianMs,
        selectedMedianMs: selected.medianMs,
      },
    })
  }
  const report = {
    release: '1.2',
    timing: {
      environment: 'Node ' + process.version,
      processor: cpus()[0]?.model,
      runs: repetitions,
      warmups: 1,
    },
    householdIds: seed.households.map((h) => h.id),
    rows,
  }
  await writeFile(
    new URL('../docs/scenario-results-1.2.json', import.meta.url),
    JSON.stringify(report, null, 2) + '\n',
  )
  await writeFile(new URL('../docs/scenario-matrix-1.2.md', import.meta.url), markdown(report))
  console.log(
    'Wrote ' +
      rows.length +
      ' validated scenarios to docs/scenario-results-1.2.json and docs/scenario-matrix-1.2.md.',
  )
} finally {
  await vite.close()
}
