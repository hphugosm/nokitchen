import { it, expect } from 'vitest'
import { DONATION_RULE } from '../src/domain/donorTypes'
import { allocationDigest } from '../src/domain/fingerprint'
import { comparePlanChanges, selectPlan, slotKey } from '../src/domain/selection'
import { planningOptions } from '../src/domain/policyTypes'
import { catalog } from '../src/data'
import { createSeed, applyAction, type Scenario } from '../src/application/state'
import { impactKey, latestImpact, previewPaste } from '../src/application/donorCommands'
import { decodeScenario, encodeScenario } from '../src/application/persistence'
import { decisionBaseline, reservedByLot, snapshotOf } from '../src/application/selectors'
import { validatePlan } from '../src/domain/validatePlan'
import { TourSession } from '../src/application/tour'
import { parseOffer } from '../src/integrations/donations/parser'
import { sampleMessages } from '../src/integrations/donations/messages'
import { createSeed as oldSeed, applyAction as oldCommand } from './frozen12/src/application/state'
import { encodeScenario as oldSave } from './frozen12/src/application/persistence'

function proposal(s: Scenario, id = 'donor-test') {
  return parseOffer(
    {
      kind: 'manual',
      text: sampleMessages[0].text,
      receivedAt: '2026-11-23T10:00:00Z',
      sender: 'Demo',
      subject: 'Pouches',
    },
    catalog,
    s.weekStart,
    id,
  )
}
function confirmed(s: Scenario, id?: string) {
  const doc = proposal(s, id)
  Object.assign(doc.rows[0], {
    storage: 'ambient',
    afterOpening: 'fridge',
    availableFromDay: 0,
    usableThroughDay: 6,
    edits: {
      storage: 'Checked pouch label',
      afterOpening: 'Checked pouch label',
      availableFromDay: 'Confirmed Monday',
      usableThroughDay: 'Confirmed through Sunday',
    },
  })
  return doc
}
it('holds hypothetical inventory separate, invalidates edited reviews and records a different actual delivery exactly once', () => {
  const seed = createSeed(),
    base = applyAction(seed, { type: 'approve', planId: seed.draft!.id })
  let s = applyAction(base, { type: 'savePaste', doc: proposal(base), expectedVersion: null })
  expect(s.lots).toBe(base.lots)
  const id = s.proposals[0].id
  expect(() => applyAction(s, { type: 'offer', step: 'review', id, expectedVersion: 1 })).toThrow()
  s = applyAction(s, { type: 'savePaste', doc: confirmed(s), expectedVersion: 1 })
  s = applyAction(s, { type: 'offer', step: 'review', id, expectedVersion: 2 })
  const bytes = encodeScenario(s),
    preview = previewPaste(s, id)
  expect(encodeScenario(s)).toBe(bytes)
  const duplicate = applyAction(s, {
    type: 'savePaste',
    doc: confirmed(s, 'another-offer'),
    expectedVersion: null,
  })
  expect(duplicate.proposals).toHaveLength(2)
  expect(duplicate.lots).toEqual(base.lots)
  const doc = structuredClone(s.proposals[0].document!)
  const actual = doc.rows.map((r) => ({
    ...r,
    quantity: 1600,
    packageCount: 8,
    edits: { ...r.edits, quantity: 'Actually delivered eight pouches' },
  }))
  const altered = applyAction(s, {
    type: 'savePaste',
    doc: { ...doc, rows: actual },
    expectedVersion: 2,
  })
  expect(altered.offerStatus[id]).toBe('offered')
  expect(impactKey(altered, id)).not.toBe(preview.key)
  expect(() =>
    applyAction(altered, {
      type: 'offer',
      id,
      step: 'receive',
      actualRows: actual,
      confirmDifferences: true,
      expectedVersion: 2,
    }),
  ).toThrow()
  const command = {
    type: 'offer' as const,
    id,
    step: 'receive' as const,
    expectedVersion: 2,
    actualRows: actual,
    confirmDifferences: true,
  }
  expect(() => applyAction(s, { ...command, confirmDifferences: false })).toThrow(/differences/)
  expect(() =>
    applyAction(s, { ...command, actualRows: [{ ...actual[0], id: 'other-row' }] }),
  ).toThrow(/source row/)
  const rechecked = applyAction(s, {
    ...command,
    actualRows: doc.rows.map((r) => ({ ...r, edits: { ...r.edits, quantity: 'Verified again' } })),
    confirmDifferences: false,
  })
  expect(rechecked.lots.at(-1)?.quantityBaseUnits).toBe(2400)
  expect(() =>
    applyAction(s, { ...command, actualRows: actual.map((r) => ({ ...r, quantity: 1700 })) }),
  ).toThrow()
  s = applyAction(s, command)
  expect(s.lots.length).toBe(base.lots.length + 1)
  expect(s.lots.at(-1)?.quantityBaseUnits).toBe(1600)
  expect(s.approved).toEqual(base.approved)
  expect(JSON.parse(encodeScenario(s)).plans[base.approved!.id].status).toBe('approved')
  expect(s.proposals[0].items[0].lot.quantityBaseUnits).toBe(2400)
  s = decodeScenario(encodeScenario(s))
  expect(applyAction(s, command)).toBe(s)
  expect(() => applyAction(s, { type: 'savePaste', doc, expectedVersion: 2 })).toThrow(/received/i)
  s = applyAction(s, { type: 'recalculate' })
  const actualImpact = latestImpact(s)!
  expect(actualImpact.items[0].lot.quantityBaseUnits).toBe(1600)
  expect(actualImpact.after.fingerprint).not.toEqual(preview.after.fingerprint)
  expect(actualImpact.before.id).toBe(base.draft!.id)
  expect(validatePlan(snapshotOf(s), s.draft!)).toEqual([])
  expect(reservedByLot(s.approved)).toEqual(reservedByLot(base.approved))
  expect(decodeScenario(encodeScenario(s))).toEqual(s)
})
it('reproduces an unchanged reviewed delivery, then improves variety without editing the approved owner', () => {
  const seed = createSeed(),
    doc = confirmed(seed),
    id = doc.id
  let s = applyAction(seed, { type: 'approve', planId: seed.draft!.id })
  s = applyAction(s, { type: 'savePaste', doc, expectedVersion: null })
  s = applyAction(s, { type: 'offer', step: 'review', id, expectedVersion: 1 })
  const preview = previewPaste(s, id)
  s = applyAction(s, { type: 'offer', step: 'receive', id, expectedVersion: 1 })
  s = applyAction(s, { type: 'recalculate' })
  expect(s.draft).toEqual(preview.after)
  const complete = applyAction(s, { type: 'improveVariety', planId: s.draft!.id })
  expect(complete.draft!.selection?.winner).toBe('improve-variety')
  expect(decisionBaseline(complete)?.id).toBe(complete.draft!.id)
  expect(complete.approved).toBe(s.approved)
  expect(latestImpact(complete)?.after.id).toBe(s.draft!.id)
  const approved = applyAction(complete, { type: 'approve', planId: complete.draft!.id })
  expect(decodeScenario(encodeScenario(approved))).toEqual(approved)
})
it('migrates a genuine 1.2 allocation and receipt without adding expanded seed stock or releasing any old reservations', () => {
  let old = oldSeed()
  for (const step of ['load', 'review', 'receive'] as const)
    old = oldCommand(old, { type: 'offer', step, id: 'OFFER-01' })
  old = oldCommand(old, { type: 'recalculate' })
  old = oldCommand(old, { type: 'approve', planId: old.draft!.id })
  expect(old.approved!.metrics.allocated).toBe(255)
  const migrated = decodeScenario(oldSave(old))
  expect(migrated.lots).toEqual(old.lots)
  expect(migrated.seedKind).toBe('migrated')
  expect(migrated.households).toEqual(old.households)
  expect(migrated.approved).toEqual(old.approved)
  expect(migrated.offerStatus).toEqual(old.offerStatus)
  expect(decisionBaseline(migrated)).toBeNull()
  const current = applyAction(migrated, { type: 'recalculate' })
  expect(current.approved).toEqual(old.approved)
  expect(current.draft!.selection?.candidates.find((c) => c.kind === 'retain')?.valid).toBe(true)
  expect(validatePlan(snapshotOf(current), current.draft!)).toEqual([])
  expect(decodeScenario(encodeScenario(current))).toEqual(current)
})
it('keeps review, preview, receipt and approval checkpoints inside the tour', () => {
  const ordinary = createSeed(),
    bytes = encodeScenario(ordinary),
    tour = new TourSession()
  tour.start()
  tour.next()
  tour.next()
  expect(tour.get()?.step).toBe(1)
  const doc = confirmed(tour.get()!.scenario)
  tour.dispatch({ type: 'savePaste', doc, expectedVersion: null }, 'saved')
  tour.next()
  tour.dispatch({ type: 'offer', id: doc.id, step: 'review', expectedVersion: 1 }, 'reviewed')
  tour.next()
  const preview = previewPaste(tour.get()!.scenario, doc.id)
  tour.markPreview(doc.id, preview.key)
  tour.next()
  tour.dispatch({ type: 'offer', id: doc.id, step: 'receive', expectedVersion: 1 }, 'received')
  tour.dispatch({ type: 'recalculate' }, 'recalculated')
  tour.next()
  tour.dispatch({ type: 'improveVariety', planId: tour.get()!.scenario.draft!.id }, 'inspected')
  tour.next()
  tour.dispatch({ type: 'approve', planId: tour.get()!.scenario.draft!.id }, 'approved')
  expect(tour.canAdvance()).toBe(true)
  expect(tour.get()!.route.mode).toBe('household')
  tour.back()
  expect(tour.get()?.scenario.approved).toBeNull()
  tour.start()
  expect(tour.get()?.scenario.proposals).toEqual([])
  tour.exit()
  expect(tour.get()).toBeNull()
  expect(encodeScenario(ordinary)).toBe(bytes)
})

function reviewedPouches(state: Scenario) {
  const doc = confirmed(state)
  const offer = applyAction(state, { type: 'savePaste', doc, expectedVersion: null })
  return applyAction(offer, { type: 'offer', id: doc.id, step: 'review', expectedVersion: 1 })
}
function planReceipt(state: Scenario, id = 'donor-test', expectedVersion: number | undefined = 1) {
  const received = applyAction(state, { type: 'offer', id, step: 'receive', expectedVersion })
  return applyAction(received, { type: 'recalculate' })
}

it('uses the approved owner for both alternatives even when a newer draft exists, and changes reservations only on ordinary approval', () => {
  const seed = createSeed(),
    id = 'donor-test'
  const authorized = applyAction(seed, { type: 'approve', planId: seed.draft!.id })
  const different = applyAction(authorized, { type: 'improveVariety', planId: seed.draft!.id })
  expect(different.draft!.id).not.toBe(authorized.approved!.id)
  const reviewed = reviewedPouches(different),
    preview = previewPaste(reviewed, id)
  expect(preview.before).toEqual(authorized.approved)
  const planned = planReceipt(reviewed),
    impact = latestImpact(planned)!
  const { keep, coverage } = impact.decision
  expect(impact.before).toEqual(preview.before)
  expect(impact.key).not.toBe(preview.key)
  expect(planned.draft).toEqual(preview.after)
  expect(impact.decision).toMatchObject({
    recommended: 'keep',
    selected: 'keep',
    baselineStatus: 'approved',
    ruleId: DONATION_RULE,
  })
  expect(impact.after).toEqual(keep)
  expect(applyAction(planned, { type: 'recalculate' })).toBe(planned)
  expect(validatePlan(snapshotOf(planned), keep!)).toEqual([])
  expect(validatePlan(snapshotOf(planned), coverage)).toEqual([])
  for (const p of [keep!, coverage]) {
    expect(p.selection!.context.snapshotFingerprint).toBe(keep!.fingerprint)
    expect(p.selection!.context.incumbentDigest).toBe(allocationDigest(impact.before))
  }
  const diff = comparePlanChanges(impact.before, coverage)
  expect(allocationDigest(coverage)).toBe(
    allocationDigest(selectPlan(snapshotOf(planned), planningOptions(impact.before))),
  )
  expect(diff.lost).toEqual([
    { householdId: 'H03', day: 4, meal: 'dinner' },
    { householdId: 'H08', day: 5, meal: 'breakfast' },
  ])
  expect(diff.filled).toHaveLength(8)
  const protectedRows = new Map(keep!.allocations.map((a) => [slotKey(a), a]))
  for (const a of impact.before.allocations) expect(protectedRows.get(slotKey(a))).toEqual(a)
  expect(keep!.allocations.length - impact.before.allocations.length).toBe(5)
  expect(coverage.metrics.allocated).toBeGreaterThan(keep!.metrics.allocated)
  const select = {
    type: 'chooseDonationCandidate' as const,
    offerId: id,
    key: impact.key,
    choice: 'coverage' as const,
  }
  expect(() => applyAction(planned, { ...select, key: preview.key })).toThrow(/out of date/)
  const switched = applyAction(decodeScenario(encodeScenario(planned)), select)
  expect(switched.draft!.id).toBe(coverage.id)
  const reloadedChoice = decodeScenario(encodeScenario(switched))
  expect(applyAction(reloadedChoice, { type: 'recalculate' })).toBe(reloadedChoice)
  expect(latestImpact(reloadedChoice)!.after.id).toBe(coverage.id)

  expect(latestImpact(switched)!.decision.selected).toBe('coverage')
  expect(() => applyAction(switched, select)).toThrow(/out of date/)
  expect(switched.approved).toEqual(authorized.approved)
  expect(reservedByLot(switched.approved)).toEqual(reservedByLot(authorized.approved))
  expect(switched.lots).toEqual(planned.lots)
  const changedImpact = latestImpact(switched)!
  expect(decodeScenario(encodeScenario(switched))).toEqual(switched)
  const approval = { type: 'approve' as const, planId: switched.draft!.id }
  const replaced = applyAction(switched, approval)
  expect(reservedByLot(replaced.approved)).toEqual(reservedByLot(coverage))
  expect(applyAction(replaced, approval)).toBe(replaced)
  expect(latestImpact(replaced)!.canChoose).toBe(false)
  expect(() => applyAction(replaced, { ...select, key: changedImpact.key })).toThrow(/out of date/)
  expect(decodeScenario(encodeScenario(replaced))).toEqual(replaced)
})

it('keeps the draft coverage-first and invalidates an otherwise identical analysis when its owner or rule changes', () => {
  const reviewed = reviewedPouches(createSeed()),
    id = 'donor-test'
  const draft = previewPaste(reviewed, id),
    planned = planReceipt(reviewed),
    actual = latestImpact(planned)!
  expect(draft.decision.recommended).toBe('coverage')
  expect(actual.decision.recommended).toBe('coverage')
  expect(actual.before).toEqual(reviewed.draft)
  expect(actual.after).toEqual(draft.decision.coverage)
  const persisted = JSON.parse(encodeScenario(planned))
  persisted.receiptComparison.ruleId = 'retired-donation-rule'
  const migrated = decodeScenario(JSON.stringify(persisted))
  expect(migrated.lots).toEqual(planned.lots)
  expect(migrated.offerStatus).toEqual(planned.offerStatus)
  expect(latestImpact(migrated)).toBeNull()
  expect(decisionBaseline(migrated)).toBeNull()
  const approved = applyAction(reviewed, { type: 'approve', planId: reviewed.draft!.id })
  const renewed = previewPaste(approved, id)
  expect(renewed.key).not.toBe(draft.key)
  expect(renewed.decision.baselineDigest).toBe(draft.decision.baselineDigest)
  expect(renewed.decision.coverage.id).not.toBe(draft.decision.coverage.id)
  expect(renewed.decision.recommended).toBe('keep')
})

it('excludes an obsolete approval after a real household restriction, and captures fixtures using the same rule', () => {
  const initial = createSeed(),
    approved = applyAction(initial, { type: 'approve', planId: initial.draft!.id })
  const old = approved.approved!
  const assigned = old.allocations.find((a) => a.householdId === 'H01')!,
    blocked = assigned.reservations[0].ingredientId
  const changed = applyAction(approved, {
    type: 'household',
    household: { ...approved.households[0], excludedIngredientIds: [blocked] },
  })
  const id = 'OFFER-01'
  let reviewed = applyAction(changed, { type: 'offer', step: 'load', id })
  reviewed = applyAction(reviewed, { type: 'offer', step: 'review', id })
  const hypothetical = previewPaste(reviewed, id)
  expect(hypothetical.decision.keep).toBeNull()
  expect(hypothetical.decision.keepIssues.length).toBeGreaterThan(0)
  expect(hypothetical.decision.recommended).toBe('coverage')
  expect(hypothetical.before).toBe(old)
  const planned = planReceipt(reviewed, id)
  const actual = latestImpact(planned)!
  expect(actual.after).toEqual(hypothetical.after)
  expect(actual.decision.keep).toBeNull()
  expect(actual.canChoose).toBe(false)
  expect(planned.approved).toBe(old)
  expect(validatePlan(snapshotOf(planned), planned.draft!)).toEqual([])
  expect(decodeScenario(encodeScenario(planned))).toEqual(planned)
})

it('opens a 1.3 receipt with no recorded recommendation status without reassigning its stock or approval', () => {
  const seed = createSeed(),
    owner = applyAction(seed, { type: 'approve', planId: seed.draft!.id }),
    reviewed = reviewedPouches(owner)
  const planned = planReceipt(reviewed),
    oldDraft = selectPlan(snapshotOf(planned), planningOptions(seed.draft))
  // 1.3 persisted the ordinary coverage-first draft and only these four receipt-comparison fields.
  const save = JSON.parse(encodeScenario(planned)),
    c = save.receiptComparison
  save.plans[oldDraft.id] = oldDraft
  save.draftId = oldDraft.id
  save.receiptComparison = {
    offerId: c.offerId,
    revision: c.revision,
    beforeId: c.beforeId,
    afterId: oldDraft.id,
  }
  const restored = decodeScenario(JSON.stringify(save))
  expect(restored.receiptComparison).toBeNull()
  expect(restored.lots).toEqual(planned.lots)
  expect(restored.proposals).toEqual(planned.proposals)
  expect(restored.approved).toEqual(owner.approved)
  expect(reservedByLot(restored.approved)).toEqual(reservedByLot(owner.approved))
  expect(decisionBaseline(restored)).toEqual(oldDraft)
})

it('captures the second actual receipt against the original approval with the first receipt already in its physical input', () => {
  const initial = createSeed(),
    owner = applyAction(initial, { type: 'approve', planId: initial.draft!.id })
  let state = { ...owner, draft: null } as Scenario
  for (const id of ['OFFER-01', 'OFFER-02']) {
    state = applyAction(state, { type: 'offer', step: 'load', id })
    state = applyAction(state, { type: 'offer', step: 'review', id })
  }
  const old = previewPaste(state, 'OFFER-02')
  state = applyAction(state, { type: 'offer', step: 'receive', id: 'OFFER-01' })
  const first = state.lots.filter((l) => l.sourceOfferId === 'OFFER-01')
  const second = previewPaste(state, 'OFFER-02')
  expect(first.length).toBeGreaterThan(0)
  expect(second.key).not.toBe(old.key)
  expect(second.before).toEqual(owner.approved)
  const final = planReceipt(decodeScenario(encodeScenario(state)), 'OFFER-02')
  const latest = latestImpact(final)!
  expect(latest.before).toEqual(owner.approved)
  expect(latest.after).toEqual(second.after)
  expect(latest.items.every((i) => i.lot.sourceOfferId === 'OFFER-02')).toBe(true)
  expect(final.lots.filter((l) => l.sourceOfferId === 'OFFER-01')).toEqual(first)
  expect(final.offerStatus).toEqual({ 'OFFER-01': 'received', 'OFFER-02': 'received' })
  expect(validatePlan(snapshotOf(final), latest.after)).toEqual([])
  expect(reservedByLot(final.approved)).toEqual(reservedByLot(owner.approved))
  expect(decodeScenario(encodeScenario(final))).toEqual(final)
})

it('uses the same computed baseline for a reviewed offer and its receipt if the session has no saved plans', () => {
  const reviewed = reviewedPouches({ ...createSeed(), draft: null })
  const prior = encodeScenario(reviewed)
  const preview = previewPaste(reviewed, 'donor-test')
  expect(preview.before.status).toBe('draft')
  expect(preview.decision.recommended).toBe('coverage')
  expect(encodeScenario(reviewed)).toBe(prior)
  const actual = latestImpact(planReceipt(reviewed))!
  expect(actual.before).toEqual(preview.before)
  expect(actual.after).toEqual(preview.after)
})

it('migrates a pending 1.3 receipt against the active approval even if its stored analysis originally captured a newer draft', () => {
  const seed = createSeed(),
    owner = applyAction(seed, { type: 'approve', planId: seed.draft!.id })
  const newer = applyAction(owner, { type: 'improveVariety', planId: seed.draft!.id })
  const reviewed = reviewedPouches(newer),
    id = 'donor-test'
  const reached = applyAction(reviewed, { type: 'offer', step: 'receive', id, expectedVersion: 1 })
  const saved = JSON.parse(encodeScenario(reached))
  // Actual 1.3 persisted only these four keys and recorded the displayed draft's ID on the receipt.
  const originalId = saved.draftId,
    revision = saved.revision
  saved.receiptComparison = { offerId: id, revision, beforeId: originalId, afterId: null }
  saved.proposals[0].receipt.baselineId = originalId
  const pending = decodeScenario(JSON.stringify(saved))
  const fresh = applyAction(decodeScenario(encodeScenario(pending)), { type: 'recalculate' })
  const impact = latestImpact(fresh)!
  expect(impact.before).toEqual(owner.approved)
  expect(fresh.proposals[0].receipt!.baselineId).toBe(originalId)
  expect(impact.decision.recommended).toBe('keep')
  expect(impact.after).toEqual(previewPaste(reviewed, id).after)
  const replaced = applyAction(fresh, { type: 'approve', planId: fresh.draft!.id })
  expect(decodeScenario(encodeScenario(replaced))).toEqual(replaced)
})
