import { expect, it } from 'vitest'
import { latestImpact } from '../src/application/donorCommands'
import { snapshotOf } from '../src/application/selectors'
import { assignmentChanges, boxIngredientTrace } from '../src/domain/impactTrace'
import { reviewedPouches } from './fixtures/pouchReceipt'

it('reconciles signed recipe and lot changes to every box, including sealed package counts', () => {
  const example = reviewedPouches(true)
  let decreases = 0
  for (const count of [8, 12] as const) {
    const state = example.receive(count),
      snapshot = snapshotOf(state),
      impact = latestImpact(state)!
    for (const plan of [impact.decision.keep!, impact.decision.coverage]) {
      for (const old of impact.before.packingLists) {
        const current = plan.packingLists.find(
          (b) => b.householdId === old.householdId && b.collectionDay === old.collectionDay,
        )!
        for (const id of new Set(
          [...old.items, ...current.items].map((item) => item.ingredientId),
        )) {
          const trace = boxIngredientTrace(
            snapshot,
            impact.before,
            plan,
            old.householdId,
            old.collectionDay,
            id,
          )
          const lotIds = new Set(
            [...old.items, ...current.items]
              .filter((item) => item.ingredientId === id)
              .map((item) => item.lotId),
          )
          expect(trace.lines.reduce((sum, row) => sum + row.delta, 0)).toBe(trace.delta)
          for (const lotId of lotIds) {
            const rows = trace.lines.filter((line) => line.lotId === lotId)
            const from = old.items.find((item) => item.lotId === lotId),
              to = current.items.find((item) => item.lotId === lotId)
            expect(rows.reduce((sum, r) => sum + r.delta, 0)).toBe(
              (to?.quantity ?? 0) - (from?.quantity ?? 0),
            )
            expect(
              rows.reduce((sum, r) => sum + (r.afterPackages ?? 0) - (r.beforePackages ?? 0), 0),
            ).toBe((to?.packages ?? 0) - (from?.packages ?? 0))
            decreases += rows.filter((line) => line.delta < 0).length
          }
        }
      }
    }
    const received = impact.items[0].lot
    const chickpeas = boxIngredientTrace(
      snapshot,
      impact.before,
      impact.decision.coverage,
      'H02',
      4,
      received.ingredientId,
    )
    expect(chickpeas.before).toBe(0)
    expect(chickpeas.after).toBe(count === 12 ? 800 : 400)
    expect(
      chickpeas.lines.every(
        (line) => line.lotId === received.id && line.source.includes(example.id),
      ),
    ).toBe(true)
  }
  expect(decreases).toBeGreaterThan(0)
})
it('recognizes changed lot commitments and ignores reservation array order', () => {
  const base = reviewedPouches(true).reviewed.approved!
  const next = structuredClone(base),
    a = next.allocations.find((row) => row.reservations.length > 1)!
  a.reservations.reverse()
  expect(assignmentChanges(base, next).every((row) => row.kind === 'unchanged')).toBe(true)
  a.reservations[0].lotId += '-replacement'
  const changed = assignmentChanges(base, next).filter((row) => row.kind !== 'unchanged')
  expect(changed).toHaveLength(1)
  expect(changed[0]).toMatchObject({
    kind: 'changed',
    day: a.day,
    meal: a.meal,
    householdId: a.householdId,
  })
})
