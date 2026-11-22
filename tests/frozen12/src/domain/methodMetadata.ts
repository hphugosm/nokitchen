import { TOOLS, UTILITIES } from './types'
import type { RecipeMethod } from './types'

/** The same authored-method completeness checks apply to catalog review, fresh batches, and retained batches. */
export function methodMetadataIssues(method: RecipeMethod): string[] {
  const issues: string[] = []
  if (
    !method.id ||
    !method.name?.trim() ||
    !method.steps?.length ||
    method.steps.some((step) => !step?.trim()) ||
    !method.water?.trim() ||
    !Number.isSafeInteger(method.minutes) ||
    method.minutes <= 0
  ) {
    issues.push(method.id + ' needs complete steps, a water instruction and a preparation time.')
  }
  if (
    !Array.isArray(method.appliances) ||
    !Array.isArray(method.tools) ||
    !Array.isArray(method.utilities)
  )
    return [...issues, method.id + ' needs explicit appliances, tools and utilities.']
  if (
    method.tools.some((t) => !TOOLS.includes(t)) ||
    method.utilities.some((u) => !UTILITIES.includes(u))
  )
    issues.push(method.id + ' references an unknown tool or utility.')
  if (method.appliances.length && !method.utilities.includes('electricity'))
    issues.push(method.id + ' lacks its electricity requirement.')
  if (method.appliances.includes('microwave') && !method.tools.includes('microwave_safe_container'))
    issues.push(method.id + ' lacks a microwave-safe container.')
  if (method.appliances.includes('kettle') && !method.tools.includes('heatproof_bowl'))
    issues.push(method.id + ' lacks a separate heatproof bowl.')
  if (method.appliances.includes('mini_oven') && !method.tools.includes('oven_safe_tray'))
    issues.push(method.id + ' lacks an oven-safe tray.')
  if (method.water !== 'No added water.' && !method.utilities.includes('potable_water'))
    issues.push(method.id + ' lacks its potable water requirement.')
  return issues
}
