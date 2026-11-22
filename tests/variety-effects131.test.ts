import { describe, expect, it } from 'vitest'
import { categoryVariety, classifyVarietyEffect } from '../src/domain/variety'

const families = new Map([
  ['a', 'family A'],
  ['a2', 'family A'],
  ['b', 'family B'],
  ['c', 'family C'],
])
const menu = (ids: string[]) =>
  categoryVariety(
    ids.map((recipeId) => ({ recipeId, portions: 2 })),
    families,
  )
describe('evidence for a category of assigned meals', () => {
  it('identifies improved spacing with the original family proportions and no new recipes', () => {
    const before = menu(['a', 'a', 'a', 'b', 'b', 'b']),
      after = menu(['a', 'b', 'a', 'b', 'a', 'b'])
    expect([before.adjacent, after.adjacent]).toEqual([4, 0])
    expect(after).toMatchObject({
      familyFrequencies: { 'family A': 3, 'family B': 3 },
      recipeFrequencies: { a: 3, b: 3 },
      slots: 6,
      portions: 12,
    })
    expect(classifyVarietyEffect(before, after)).toMatchObject({
      broader: false,
      moreBalanced: false,
      betterSpacing: true,
      recipeVariants: false,
    })
  })
  it('reports shared-family variants alongside spacing, and separates balance from breadth', () => {
    const before = menu(['a', 'a', 'a', 'b', 'b', 'b'])
    expect(classifyVarietyEffect(before, menu(['a', 'b', 'a2', 'b', 'a', 'b']))).toMatchObject({
      broader: false,
      betterSpacing: true,
      recipeVariants: true,
      variantFamilies: ['family A'],
    })
    expect(
      classifyVarietyEffect(menu(['a', 'a', 'a', 'b']), menu(['a', 'b', 'a', 'b'])),
    ).toMatchObject({
      broader: false,
      moreBalanced: true,
      betterSpacing: false,
      recipeVariants: false,
    })
    expect(
      classifyVarietyEffect(menu(['a', 'a', 'a', 'b']), menu(['a', 'a2', 'b', 'c'])),
    ).toMatchObject({
      broader: true,
      moreBalanced: true,
      recipeVariants: true,
      addedFamilies: ['family C'],
    })
  })
  it('does not call a drop in meal count or a proportional scale-up improved balance or different recipes', () => {
    const before = menu(['a', 'a2', 'b', 'b'])
    expect(classifyVarietyEffect(before, menu(['a', 'b']))).toMatchObject({
      moreBalanced: false,
      betterSpacing: false,
    })
    expect(classifyVarietyEffect(before, menu(['a2', 'a', 'b', 'b']))).toMatchObject({
      recipeVariants: false,
      reorderedFamilies: ['family A'],
    })
    expect(
      classifyVarietyEffect(before, menu(['a', 'a2', 'a', 'a2', 'b', 'b', 'b', 'b'])),
    ).toMatchObject({ moreBalanced: false, recipeVariants: false })
  })
})
