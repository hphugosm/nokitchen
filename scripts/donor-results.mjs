// Exercise the reviewed-paste and receipt commands with explicit synthetic product and model-window confirmations.
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { createServer } from 'vite'

const vite = await createServer({
  configFile: false,
  appType: 'custom',
  logLevel: 'error',
  server: { middlewareMode: true, hmr: false, watch: null },
})
try {
  await mkdir('dist/legacy-evidence', { recursive: true })
  const load = (p) => vite.ssrLoadModule('/src/' + p + '.ts')
  const { createSeed, applyAction } = await load('application/state')
  const { decodeScenario, encodeScenario } = await load('application/persistence')
  const { latestImpact, previewPaste } = await load('application/donorCommands')
  const { snapshotOf, reservedByLot } = await load('application/selectors')
  const { catalog } = await load('data/index')
  const { validatePlan } = await load('domain/validatePlan')
  const { varietyReport } = await load('domain/variety')
  const { allocationDigest } = await load('domain/fingerprint')
  const { comparePlanChanges } = await load('domain/selection')
  const { sampleMessages, ManualMessageSource } = await load('integrations/donations/messages')
  const { parseOffer } = await load('integrations/donations/parser')
  const initial = createSeed(),
    before = initial.draft
  const msg = await new ManualMessageSource(
    { text: sampleMessages[0].text, subject: 'Packaged chickpeas', sender: 'Synthetic donor' },
    '2026-11-23T09:00:00Z',
  ).obtain()
  const doc = parseOffer(msg, catalog, initial.weekStart, 'pasted-demo-chickpeas')
  let reviewed = applyAction(initial, { type: 'approve', planId: before.id })
  reviewed = applyAction(reviewed, { type: 'savePaste', doc, expectedVersion: null })
  const row = {
    ...doc.rows[0],
    storage: 'ambient',
    afterOpening: 'fridge',
    availableFromDay: 0,
    usableThroughDay: 6,
    edits: {
      storage: 'Operator checked sealed shelf-stable pouch label',
      afterOpening: 'Label requires refrigeration after opening',
      availableFromDay: 'Confirmed on Monday',
      usableThroughDay: 'Operator confirmed through Sunday',
    },
  }
  reviewed = applyAction(reviewed, {
    type: 'savePaste',
    doc: { ...doc, rows: [row] },
    expectedVersion: 1,
  })
  reviewed = applyAction(reviewed, {
    type: 'offer',
    id: doc.id,
    step: 'review',
    expectedVersion: 2,
  })
  const preview = previewPaste(reviewed, doc.id)
  function receive(actualCount) {
    const rows =
      actualCount === 12
        ? [row]
        : [
            {
              ...row,
              quantity: 200 * actualCount,
              packageCount: actualCount,
              edits: {
                ...row.edits,
                packageCount: 'Actual count at receipt',
                quantity: 'Weighed edible total',
              },
            },
          ]
    const command = {
      type: 'offer',
      id: doc.id,
      step: 'receive',
      actualRows: rows,
      expectedVersion: 2,
      confirmDifferences: actualCount !== 12,
    }
    const received = applyAction(reviewed, command)
    const restored = decodeScenario(encodeScenario(received))
    assert.equal(applyAction(restored, command), restored)
    let planned = applyAction(restored, { type: 'recalculate' })
    const actual = latestImpact(planned)
    if (actual.canChoose && actual.decision.selected !== 'coverage') {
      planned = applyAction(planned, {
        type: 'chooseDonationCandidate',
        offerId: doc.id,
        key: actual.key,
        choice: 'coverage',
      })
    }
    const final = applyAction(planned, { type: 'improveVariety', planId: planned.draft.id })
    const snap = snapshotOf(planned),
      selected = planned.draft,
      better = final.draft
    for (const p of [selected, better]) assert.deepEqual(validatePlan(snap, p), [])
    assert.deepEqual(reservedByLot(reviewed.approved), reservedByLot(final.approved))
    const approval = applyAction(final, { type: 'approve', planId: better.id })
    assert.deepEqual(reservedByLot(approval.approved), reservedByLot(better))
    const summarize = (p) => ({
      metrics: p.metrics,
      allocationDigest: allocationDigest(p),
      context: p.selection.context,
      winner: p.selection.winner,
      households: varietyReport(snap, p).households,
    })
    function boxChanges(previous, current) {
      return current.packingLists.flatMap((box) => {
        const old = previous.packingLists.find(
          (b) => b.householdId === box.householdId && b.collectionDay === box.collectionDay,
        )
        const ids = new Set([...box.items, ...old.items].map((i) => i.lotId))
        const deltas = [...ids].sort().flatMap((id) => {
          const a = old.items.find((x) => x.lotId === id),
            b = box.items.find((x) => x.lotId === id),
            delta = (b?.quantity ?? 0) - (a?.quantity ?? 0)
          const ing = catalog.ingredients.find((i) => i.id === (b ?? a).ingredientId)
          return delta
            ? [
                {
                  lotId: id,
                  ingredient: ing.name,
                  unit: ing.unit,
                  before: a?.quantity ?? 0,
                  after: b?.quantity ?? 0,
                  delta,
                },
              ]
            : []
        })
        return deltas.length
          ? [{ household: box.householdId, collectionDay: box.collectionDay, deltas }]
          : []
      })
    }
    return {
      actualCount,
      added: actual.items,
      before: summarize(before),
      afterReceipt: summarize(selected),
      afterVariety: summarize(better),
      receiptEffect: comparePlanChanges(before, selected),
      varietyEffect: comparePlanChanges(selected, better),
      receiptBoxChanges: boxChanges(before, selected),
      varietyBoxChanges: boxChanges(selected, better),
      afterVarietyBoxes: better.packingLists,
      validation: 'Passed',
      confirmedOnceAfterReload: true,
    }
  }
  const full = receive(12),
    partial = receive(8)
  assert.equal(full.afterReceipt.allocationDigest, allocationDigest(preview.decision.coverage))
  assert.notEqual(
    partial.afterReceipt.context.snapshotFingerprint,
    preview.decision.coverage.fingerprint,
  )
  const result = {
    weekStart: initial.weekStart,
    scenario: 'Expanded 1.3 seed with independent receipt branches',
    message: msg,
    operatorConfirmed: row,
    hypothetical: {
      offeredPouches: 12,
      before: before.metrics,
      after: preview.decision.coverage.metrics,
      context: preview.decision.coverage.selection.context,
    },
    asOffered: full,
    actualDifference: partial,
  }
  await writeFile(
    'dist/legacy-evidence/donor-impact-1.3.json',
    JSON.stringify(result, null, 2) + '\n',
  )
  console.log(
    JSON.stringify({
      preview: preview.decision.coverage.metrics.allocated,
      asOffered: full.afterReceipt.metrics.allocated,
      actualEight: partial.afterReceipt.metrics.allocated,
      filled: full.receiptEffect.filled,
      lost: full.receiptEffect.lost,
      changed: full.receiptEffect.changed.length,
      householdEffects: full.receiptEffect.deltas,
      box: full.receiptBoxChanges.find((b) => b.deltas.some((d) => d.lotId.startsWith(doc.id))),
      varietyChanges: full.varietyEffect.changed.length,
    }),
  )
} finally {
  await vite.close()
}
