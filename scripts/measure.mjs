// Run against the local Vite dev server. Time pure calls in the same browser used by the walkthrough.
import { existsSync } from 'node:fs'
import { chromium } from 'playwright'
const executablePath =
  process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined)
const browser = await chromium.launch({ executablePath })
try {
  const page = await browser.newPage()
  await page.goto(process.env.NOKITCHEN_URL || 'http://127.0.0.1:5173/')
  console.log(
    JSON.stringify(
      await page.evaluate(async () => {
        const { catalog, seedHouseholds, seedLots } = await import('/src/data/index.ts')
        const { validatePlan } = await import('/src/domain/engine.ts')
        const { comparePlanners, evaluateActions, teachingScenario } =
          await import('/src/domain/analysis.ts')
        const snapshot = { ...catalog, households: seedHouseholds, lots: seedLots, revision: 1 }
        function measure(fn) {
          const samples = []
          let result
          for (let i = 0; i < 21; i++) {
            const start = performance.now()
            result = fn()
            samples.push(performance.now() - start)
          }
          samples.sort((a, b) => a - b)
          return { medianMs: Number(samples[10].toFixed(1)), result }
        }
        const { selectPlan } = await import('/src/domain/selection.ts')
        const { planningOptions } = await import('/src/domain/policyTypes.ts')
        const planner = measure(() => selectPlan(snapshot, planningOptions(null)))
        const compare = measure(() => comparePlanners(snapshot))
        const actions = measure(() => evaluateActions(snapshot, 'H01', undefined, planner.result))
        const examples = {}
        for (const example of ['teaching', 'neutral']) {
          const s = teachingScenario(snapshot, example)
          const c = comparePlanners(s)
          examples[example] = [
            c.reference.plan.metrics.allocated,
            c.nokitchen.plan.metrics.allocated,
          ]
          for (const result of [c.reference, c.nokitchen])
            if (validatePlan(s, result.plan).length) throw Error('Invalid example plan')
        }
        return {
          samples: 21,
          policy: planner.result.selection.context.policyId,
          mode: 'Cold selector and comparison; four actions supplied the selected baseline.',
          plannerMs: planner.medianMs,
          comparisonMs: compare.medianMs,
          whatIfMs: actions.medianMs,
          allocated: planner.result.metrics.allocated,
          requested: planner.result.metrics.requested,
          reference: compare.result.reference.plan.metrics.allocated,
          examples,
          deltas: compare.result.deltas.map((r) => [r.householdId, r.delta]),
          actions: actions.result.results.map((r) => ({
            action: r.action.label,
            target: [r.targetBefore, r.targetAfter],
            week: [r.totalBefore, r.totalAfter],
            group: r.group,
          })),
          planIssues: [
            ...validatePlan(snapshot, planner.result),
            ...validatePlan(snapshot, compare.result.reference.plan),
          ],
        }
      }),
      null,
      2,
    ),
  )
} finally {
  await browser.close()
}
