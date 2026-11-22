import { DONATION_RULE, type DonationChoice, type DonationDecision } from './donorTypes'
import { compareVariety, varietyReport } from './variety'
import { searchVariety } from './varietySearch'
import { extendAssignments, familyAwarePlan, runPlanner, residualUnfilled } from './allocation'
import { allocationDigest, contextFor } from './fingerprint'
import { planMetrics, requestedPortions } from './packingLists'
import { ENGINE_VERSION, POLICY_ID, planningOptions } from './policyTypes'
import type {
  CandidateEvidence,
  CandidateKind,
  CandidateScore,
  PlanChange,
  PlanningOptions,
  SelectedPlan,
} from './policyTypes'
import { DAYS, MEALS, requestForSlot } from './types'
import type { Allocation, AllocationPlan, PlanningSnapshot, Slot, Unfilled } from './types'
import { validatePlan } from './validatePlan'

export const slotKey = (s: Slot) => [s.householdId, s.day, s.meal].join('|')
export const slotOnly = ({ householdId, day, meal }: Slot): Slot => ({ householdId, day, meal })
const sameMeal = (a: Allocation, b: Allocation) =>
  a.recipeId === b.recipeId && a.methodId === b.methodId && a.portions === b.portions

function planCounts(plan: AllocationPlan) {
  const rows = new Map<string, { allocated: number; requested: number }>()
  function count(id: string, portions: number, allocated: boolean) {
    const row = rows.get(id) ?? { allocated: 0, requested: 0 }
    row.requested += portions
    if (allocated) row.allocated += portions
    rows.set(id, row)
  }
  for (const a of plan.allocations) count(a.householdId, a.portions, true)
  for (const u of plan.unfilled) count(u.householdId, u.requested, false)
  for (const list of plan.packingLists)
    if (!rows.has(list.householdId)) rows.set(list.householdId, { allocated: 0, requested: 0 })
  return rows
}

export function comparePlanChanges(before: AllocationPlan, after: AllocationPlan): PlanChange {
  const old = new Map(before.allocations.map((a) => [slotKey(a), a]))
  const next = new Map(after.allocations.map((a) => [slotKey(a), a]))
  const original = planCounts(before),
    changed = planCounts(after)
  const ids = [...new Set([...original.keys(), ...changed.keys()])].sort()
  const deltas = ids.map((householdId) => {
    const a = original.get(householdId) ?? { allocated: 0, requested: 0 }
    const b = changed.get(householdId) ?? { allocated: 0, requested: 0 }
    return {
      householdId,
      before: a.allocated,
      after: b.allocated,
      delta: b.allocated - a.allocated,
      percentagePoints:
        a.requested && b.requested
          ? 100 * (b.allocated / b.requested - a.allocated / a.requested)
          : null,
    }
  })
  return {
    deltas,
    filled: after.allocations.filter((a) => !old.has(slotKey(a))).map(slotOnly),
    lost: before.allocations.filter((a) => !next.has(slotKey(a))).map(slotOnly),
    changed: after.allocations.flatMap((a) => {
      const b = old.get(slotKey(a))
      return b && !sameMeal(b, a)
        ? [
            {
              ...slotOnly(a),
              fromRecipeId: b.recipeId,
              toRecipeId: a.recipeId,
              fromMethodId: b.methodId,
              toMethodId: a.methodId,
              fromPortions: b.portions,
              toPortions: a.portions,
            },
          ]
        : []
    }),
  }
}

type Fraction = NonNullable<CandidateScore['minimum']>
function compareRatio(a: Fraction | null, b: Fraction | null): number {
  if (!a || !b) return a ? 1 : b ? -1 : 0
  const diff = BigInt(a.allocated) * BigInt(b.requested) - BigInt(b.allocated) * BigInt(a.requested)
  return diff > 0n ? 1 : diff < 0n ? -1 : 0
}

function scorePlan(
  snapshot: PlanningSnapshot,
  plan: AllocationPlan,
  incumbent: AllocationPlan | null,
): CandidateScore {
  const allocated = new Map<string, number>()
  const used = new Map<string, Set<string>>()
  let repeats = 0
  for (const a of plan.allocations) {
    allocated.set(a.householdId, (allocated.get(a.householdId) ?? 0) + a.portions)
    const recipes = used.get(a.householdId) ?? new Set()
    if (recipes.has(a.recipeId)) repeats++
    recipes.add(a.recipeId)
    used.set(a.householdId, recipes)
  }
  let minimum: Fraction | null = null
  for (const h of snapshot.households) {
    const requested = requestedPortions(h)
    if (!requested) continue
    const fraction = { allocated: allocated.get(h.id) ?? 0, requested }
    if (!minimum || compareRatio(fraction, minimum) < 0) minimum = fraction
  }
  const next = new Map(plan.allocations.map((a) => [slotKey(a), a]))
  const changedAssigned =
    incumbent?.allocations.filter((a) => {
      const b = next.get(slotKey(a))
      return !b || !sameMeal(a, b)
    }).length ?? 0
  return {
    total: plan.metrics.allocated,
    minimum,
    changedAssigned,
    repeats,
    variety: varietyReport(snapshot, plan).score,
  }
}

// Stable candidate IDs order equivalent methods without granting priority over a scored difference.
const candidateId: Record<CandidateKind, string> = {
  retain: '01-retain',
  extend: '02-extend',
  'fresh-legacy': '03-fresh-legacy',
  'family-aware': '04-family-aware',
  'fresh-refined': '06-fresh-refined',
  'improve-variety': '05-improve-variety',
}
type Scored = { kind: CandidateKind; score: CandidateScore }
function ranking(a: Scored, b: Scored): [number, string] {
  const steps: [number, string][] = [
    [b.score.total - a.score.total, 'more allocated portions'],
    [-compareRatio(a.score.minimum, b.score.minimum), 'higher minimum household coverage'],
    [a.score.changedAssigned - b.score.changedAssigned, 'fewer previously assigned meals changed'],
    [
      compareVariety(
        a.score.variety ?? [0, 0, a.score.repeats],
        b.score.variety ?? [0, 0, b.score.repeats],
      ),
      'better household meal-family variety',
    ],
    [
      candidateId[a.kind] < candidateId[b.kind]
        ? -1
        : candidateId[a.kind] > candidateId[b.kind]
          ? 1
          : 0,
      'stable candidate ID after equal scores',
    ],
  ]
  return steps.find(([result]) => result !== 0) ?? [0, 'equal candidates']
}
export const compareCandidateScores = (a: Scored, b: Scored) => ranking(a, b)[0]

function rebind(
  snapshot: PlanningSnapshot,
  incumbent: AllocationPlan,
  fingerprint: string,
): AllocationPlan {
  const occupied = new Set(incumbent.allocations.map(slotKey))
  const gaps: Unfilled[] = []
  for (const h of snapshot.households)
    for (let day = 0; day < DAYS.length; day++)
      for (const meal of MEALS) {
        const slot = { householdId: h.id, day, meal },
          requested = requestForSlot(h, day, meal)
        if (requested && !occupied.has(slotKey(slot)))
          gaps.push({
            ...slot,
            requested,
            reasons: [
              {
                code: 'UNASSIGNED',
                message: 'This retained plan has no assignment for the requested slot.',
              },
            ],
          })
      }
  // Keep supplied packing evidence for the audit. Rebuilding it before validation could hide a corrupt list.
  return {
    ...incumbent,
    id: 'revalidated-' + fingerprint,
    status: 'draft',
    revision: snapshot.revision,
    fingerprint,
    selection: undefined,
    unfilled: gaps,
    metrics: planMetrics(snapshot.households, incumbent.allocations),
  }
}

function rankedPlans(snapshot: PlanningSnapshot, options: PlanningOptions) {
  if (
    options.operation !== 'select' ||
    options.engineVersion !== ENGINE_VERSION ||
    options.policyId !== POLICY_ID
  )
    throw new Error('Unsupported planning policy or engine.')
  const context = contextFor(snapshot, options),
    incumbent = options.incumbentPlan
  const candidates: CandidateEvidence[] = []
  const valid: { kind: CandidateKind; score: CandidateScore; plan: AllocationPlan }[] = []
  function inspect(kind: CandidateKind, plan: AllocationPlan) {
    const issues = validatePlan(snapshot, plan)
    const score = issues.length ? null : scorePlan(snapshot, plan, incumbent)
    candidates.push({
      kind,
      issues,
      valid: !issues.length,
      score,
      allocationDigest: allocationDigest(plan),
    })
    if (score) valid.push({ kind, plan, score })
    return !issues.length
  }
  inspect('fresh-legacy', runPlanner(snapshot, 'nokitchen'))
  inspect('family-aware', familyAwarePlan(snapshot))
  if (!incumbent && valid.length && snapshot.recipes.some((recipe) => !!recipe.familyId)) {
    const leader = [...valid].sort(compareCandidateScores)[0].plan
    const refined = searchVariety(snapshot, leader, 1).plan
    if (refined !== leader)
      inspect('fresh-refined', { ...refined, unfilled: residualUnfilled(snapshot, refined) })
  }
  if (incumbent) {
    const retained = rebind(snapshot, incumbent, context.snapshotFingerprint)
    if (inspect('retain', retained)) {
      const extended = extendAssignments(snapshot, retained.allocations)
      inspect('extend', extended)
      // Equal totals mean extension found no feasible additional batch. These reasons describe the same fixed residual ledger.
      if (extended.metrics.allocated === retained.metrics.allocated)
        retained.unfilled = extended.unfilled
    } else
      candidates.push({
        kind: 'extend',
        valid: false,
        score: null,
        allocationDigest: null,
        issues: ['Fixed assignments failed incumbent revalidation.'],
      })
  }
  valid.sort(compareCandidateScores)
  return { valid, candidates }
}

function selected(
  snapshot: PlanningSnapshot,
  options: PlanningOptions,
  pool: ReturnType<typeof rankedPlans>,
  keepOnly = false,
): SelectedPlan {
  const { candidates } = pool
  const valid = keepOnly
    ? pool.valid.filter((c) => c.kind === 'retain' || c.kind === 'extend')
    : pool.valid
  const chosen = valid[0]
  const context = contextFor(snapshot, options),
    incumbent = options.incumbentPlan
  if (!chosen)
    throw new Error(
      'No candidate passed the plan validator. ' + candidates.flatMap((c) => c.issues).join(' '),
    )
  const digest = allocationDigest(chosen.plan)
  const reason =
    valid.length > 1
      ? valid
          .slice(1)
          .map((other) => {
            const criterion = ranking(chosen, other)[1]
            return (
              chosen.kind +
              ' over ' +
              other.kind +
              ' (' +
              chosen.score.total +
              ' vs ' +
              other.score.total +
              ' portions): ' +
              criterion +
              '.'
            )
          })
          .join(' ')
      : 'The only validated candidate in this selection.'
  return {
    ...chosen.plan,
    strategy: 'meal-coverage-first',
    id: [context.key, POLICY_ID, candidateId[chosen.kind], digest].join(':'),
    status: 'draft',
    selection: {
      context,
      winner: chosen.kind,
      reason,
      allocationDigest: digest,
      candidates,
      ...(chosen.kind === 'extend' ? { fixedSlots: incumbent!.allocations.map(slotOnly) } : {}),
    },
  }
}

export function selectPlan(
  snapshot: PlanningSnapshot,
  options: PlanningOptions = planningOptions(),
): SelectedPlan {
  return selected(snapshot, options, rankedPlans(snapshot, options))
}

export function donationOptions(base: AllocationPlan, choice: DonationChoice): PlanningOptions {
  return planningOptions(base, 'select', [DONATION_RULE, base.status, choice].join('/'))
}

/** Both views come from one validation and ranking of this snapshot against the same physical commitments. */
export function donationDecision(
  snapshot: PlanningSnapshot,
  base: AllocationPlan,
): DonationDecision {
  const options = donationOptions(base, 'coverage'),
    pool = rankedPlans(snapshot, options)
  const coverage = selected(snapshot, options, pool)
  const retained = pool.candidates.find((c) => c.kind === 'retain')!
  const keep = retained.valid ? selected(snapshot, donationOptions(base, 'keep'), pool, true) : null
  const recommended = base.status === 'approved' && keep ? 'keep' : 'coverage'
  return {
    ruleId: DONATION_RULE,
    baselineStatus: base.status,
    baselineDigest: allocationDigest(base),
    recommended,
    selected: recommended,
    keep,
    coverage,
    keepIssues: retained.issues,
  }
}

export function improveVariety(
  snapshot: PlanningSnapshot,
  base: AllocationPlan,
): { plan: AllocationPlan; improved: boolean; reason: string } {
  const issues = validatePlan(snapshot, base)
  if (issues.length)
    return {
      plan: base,
      improved: false,
      reason: 'The source plan is out of date or invalid. Recalculate before improving variety.',
    }
  const result = searchVariety(snapshot, base)
  if (result.plan === base)
    return {
      plan: base,
      improved: false,
      reason: 'No improvement found within the fixed search budget and available stock.',
    }
  const before = varietyReport(snapshot, base),
    after = varietyReport(snapshot, result.plan)
  if (
    compareVariety(after.score, before.score) >= 0 ||
    after.households.some((row, i) => compareVariety(row.score, before.households[i].score) > 0)
  )
    throw new Error('The variety pass did not preserve its household improvement criteria.')
  const changes = comparePlanChanges(base, result.plan)
  if (
    changes.filled.length ||
    changes.lost.length ||
    changes.deltas.some((r) => r.delta !== 0) ||
    changes.changed.some((c) => c.fromPortions !== c.toPortions)
  )
    throw new Error('The variety pass changed household coverage.')
  const digest = allocationDigest(result.plan),
    context = contextFor(snapshot, planningOptions(base, 'improve-variety'))
  const reason =
    'Improved household variety at fixed coverage with ' +
    result.singles +
    ' single-meal and ' +
    result.pairs +
    ' paired changes.'
  const score = scorePlan(snapshot, result.plan, base)
  const plan: AllocationPlan = {
    ...result.plan,
    strategy: 'meal-coverage-first',
    status: 'draft',
    unfilled: residualUnfilled(snapshot, result.plan),
    id: [context.key, POLICY_ID, candidateId['improve-variety'], digest].join(':'),
    selection: {
      context,
      winner: 'improve-variety',
      reason,
      allocationDigest: digest,
      candidates: [
        {
          kind: 'retain',
          valid: true,
          issues: [],
          allocationDigest: allocationDigest(base),
          score: scorePlan(snapshot, base, base),
        },
        { kind: 'improve-variety', valid: true, issues: [], allocationDigest: digest, score },
      ],
    },
  }
  const finalIssues = validatePlan(snapshot, plan)
  if (finalIssues.length)
    throw new Error('Variety draft failed validation. ' + finalIssues.join(' '))
  return { plan, improved: true, reason }
}
