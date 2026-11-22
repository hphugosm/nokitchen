import {
  assess,
  byId,
  fixedReasons,
  lotReason,
  makeContext,
  methodReasons,
  type Context,
} from './feasibility'
import { buildPackingLists } from './packingLists'
import { SEARCH_BUDGET } from './policyTypes'
import { validatePlan } from './validatePlan'
import {
  categoryOf,
  categoryScore,
  categoryVariety,
  chronology,
  compareVariety,
  familyOf,
  type VarietyScore,
} from './variety'
import type {
  Allocation,
  AllocationPlan,
  Household,
  PlanningSnapshot,
  Recipe,
  Reservation,
} from './types'

interface Proposal {
  indices: number[]
  recipes: Recipe[]
  score: VarietyScore
  changed: number
  key: string
}
const adjust = (ledger: Map<string, number>, claims: Reservation[], sign: number) => {
  for (const r of claims) ledger.set(r.lotId, (ledger.get(r.lotId) ?? 0) + sign * r.quantity)
}
function proposalOrder(a: Proposal, b: Proposal) {
  return (
    compareVariety(a.score, b.score) ||
    a.changed - b.changed ||
    (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
  )
}

function trials(
  snapshot: PlanningSnapshot,
  current: AllocationPlan,
  original: AllocationPlan,
  h: Household,
  ctx: Context,
  pair: boolean,
) {
  const positions = current.allocations
    .map((a, i) => ({ a, i }))
    .filter((x) => x.a.householdId === h.id)
    .sort((a, b) => chronology(a.a, b.a))
  const families = new Map(snapshot.recipes.map((r) => [r.id, familyOf(r)]))
  const counts = new Map<string, number>()
  for (const { a } of positions) {
    const key = categoryOf(a.meal) + '|' + families.get(a.recipeId)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const repeated = (a: Allocation) =>
    (counts.get(categoryOf(a.meal) + '|' + families.get(a.recipeId)) ?? 0) > 1
  if (!positions.some((x) => repeated(x.a))) return []
  const eligible = new Map<number, Recipe[]>()
  // Cheap optimistic bound: only inventory still free or released by these slots can supply a replacement.
  // Exact packs and feasibility are checked in the limited number of atomic trials below.
  const supplies = new Map<string, number>()
  for (const { i, a } of positions) {
    eligible.set(
      i,
      snapshot.recipes
        .filter(
          (r) =>
            r.mealTypes.includes(a.meal) &&
            !fixedReasons(ctx, h, r, a.day).length &&
            r.methods.some((m) => !methodReasons(ctx, h, m).length),
        )
        .sort(byId),
    )
    for (const lot of snapshot.lots) {
      const k = a.day + '|' + lot.ingredientId
      if (supplies.has(k)) continue
      const n = (ctx.lotsByIngredient.get(lot.ingredientId) ?? [])
        .filter((l) => !lotReason(l, h, a.day))
        .reduce((total, l) => total + (ctx.remaining.get(l.id) ?? 0), 0)
      supplies.set(k, n)
    }
  }

  const score = (changes: Map<number, Recipe>) => {
    const seq = positions.map(({ i, a }) => ({
      recipeId: changes.get(i)?.id ?? a.recipeId,
      portions: a.portions,
      category: categoryOf(a.meal),
    }))
    const breakfast = categoryScore(
      categoryVariety(
        seq.filter((s) => s.category === 'breakfast'),
        families,
      ),
    )
    const main = categoryScore(
      categoryVariety(
        seq.filter((s) => s.category === 'main'),
        families,
      ),
    )
    return breakfast.map((v, n) => v + main[n]) as VarietyScore
  }
  const before = score(new Map())
  const proposals: Proposal[] = []
  function candidates(index: number, released: number[]) {
    const a = current.allocations[index]
    const extra = new Map<string, number>()
    for (const j of released)
      for (const r of current.allocations[j].reservations) {
        if (!lotReason(ctx.lotsById.get(r.lotId)!, h, a.day))
          extra.set(r.ingredientId, (extra.get(r.ingredientId) ?? 0) + r.quantity)
      }
    return eligible
      .get(index)!
      .filter(
        (r) =>
          r.id !== a.recipeId &&
          r.required.every(
            (q) =>
              q.quantity * a.portions <=
              (supplies.get(a.day + '|' + q.ingredientId) ?? 0) + (extra.get(q.ingredientId) ?? 0),
          ),
      )
  }
  function propose(indices: number[], recipes: Recipe[]) {
    const changes = new Map(indices.map((i, n) => [i, recipes[n]]))
    const result = score(changes)
    if (compareVariety(result, before) >= 0) return
    const changed = positions.filter(
      ({ i, a }) => (changes.get(i)?.id ?? a.recipeId) !== original.allocations[i].recipeId,
    ).length
    proposals.push({
      indices,
      recipes,
      score: result,
      changed,
      key: indices.map((i, n) => i + ':' + recipes[n].id).join('|'),
    })
  }
  if (!pair) {
    for (const { a, i } of positions)
      if (repeated(a)) for (const r of candidates(i, [i])) propose([i], [r])
  } else {
    for (let x = 0; x < positions.length; x++)
      for (let y = x + 1; y < positions.length; y++) {
        const left = positions[x],
          right = positions[y]
        if (!repeated(left.a) && !repeated(right.a)) continue
        const indices = [left.i, right.i]
        // Consider a direct swap (including a previously assigned family) and a bounded shortlist of alternative pairs.
        const shortlist = (i: number, other: Allocation) => {
          const options = candidates(i, indices)
          options.sort(
            (a, b) =>
              (counts.get(categoryOf(current.allocations[i].meal) + '|' + familyOf(a)) ?? 0) -
                (counts.get(categoryOf(current.allocations[i].meal) + '|' + familyOf(b)) ?? 0) ||
              byId(a, b),
          )
          const swap = options.find((r) => r.id === other.recipeId)
          return [...new Set([...(swap ? [swap] : []), ...options.slice(0, 3)])]
        }
        const rightOptions = shortlist(right.i, left.a)
        for (const a of shortlist(left.i, right.a))
          for (const b of rightOptions) propose(indices, [a, b])
      }
  }
  return proposals.sort(proposalOrder)
}

/** Two round-robin passes with a fixed per-household share prevent the first household from exhausting the search. */
export function searchVariety(
  snapshot: PlanningSnapshot,
  base: AllocationPlan,
  maxAccepted = Number.POSITIVE_INFINITY,
) {
  const ctx = makeContext(snapshot)
  for (const a of base.allocations) adjust(ctx.remaining, a.reservations, -1)
  let current = base,
    attempts = 0,
    singles = 0,
    pairs = 0
  const homes = [...snapshot.households]
    .sort(byId)
    .filter((h) => base.allocations.some((a) => a.householdId === h.id))
  const passes = 2
  const quota = Math.max(1, Math.floor(SEARCH_BUDGET / (passes * Math.max(1, homes.length))))
  for (let pass = 0; pass < passes && attempts < SEARCH_BUDGET; pass++)
    for (const h of homes) {
      if (singles + pairs >= maxAccepted) return { plan: current, attempts, singles, pairs }
      // If the single-meal trials cannot improve this household, reserve at least half the share for pairs.
      let committed = false
      for (const pair of [false, true]) {
        if (committed || attempts >= SEARCH_BUDGET) break
        const maxAttempts = pair
          ? quota - Math.floor(quota / 2)
          : Math.max(1, Math.floor(quota / 2))
        const offers = trials(snapshot, current, base, h, ctx, pair).slice(
          0,
          Math.min(maxAttempts, SEARCH_BUDGET - attempts),
        )
        for (const proposal of offers) {
          attempts++
          const ledger = { ...ctx, remaining: new Map(ctx.remaining) }
          for (const i of proposal.indices)
            adjust(ledger.remaining, current.allocations[i].reservations, +1)
          const changes: Allocation[] = []
          for (const [n, i] of proposal.indices.entries()) {
            const a = current.allocations[i],
              recipe = proposal.recipes[n]
            const check = assess(ledger, h, recipe, a.day, a.portions)
            if (!check.feasible || !check.methodId) break
            adjust(ledger.remaining, check.reservations, -1)
            changes.push({
              ...a,
              recipeId: recipe.id,
              methodId: check.methodId,
              reservations: check.reservations,
            })
          }
          if (changes.length !== proposal.indices.length) continue
          const allocations = [...current.allocations]
          proposal.indices.forEach((i, n) => {
            allocations[i] = changes[n]
          })
          const next = {
            ...current,
            allocations,
            packingLists: buildPackingLists(snapshot, allocations),
          }
          if (validatePlan(snapshot, next).length) continue
          current = next
          ctx.remaining = ledger.remaining
          if (pair) pairs++
          else singles++
          committed = true
          break
        }
      }
    }
  return { plan: current, attempts, singles, pairs }
}
