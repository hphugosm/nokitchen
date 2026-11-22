import { createContext, useContext, useEffect, useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, Check, CircleDashed, Clock3, Moon, Sunrise, Sun, X } from 'lucide-react'
import type { WorkspaceUI } from '../application/uiContract'
import {
  DAYS,
  type Household,
  type Meal,
  type PlanningSnapshot,
  type Reason,
  type RecipeMethod,
  type Slot,
} from '../domain/types'

export const WorkContext = createContext<WorkspaceUI | null>(null)
export const useWork = () => useContext(WorkContext)!
export const pretty = (s: string) => s.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())
export const plural = (n: number, singular: string, many = singular + 's') =>
  n + ' ' + (n === 1 ? singular : many)
export const personCount = (n: number) => plural(n, 'person', 'people')
export const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 1 })
export const ingredientFor = (s: PlanningSnapshot, id: string) =>
  s.ingredients.find((x) => x.id === id)!
export const applianceNames = (s: PlanningSnapshot, h: Household) =>
  h.appliances.map((id) => s.appliances.find((a) => a.id === id)?.name ?? pretty(id))
export const slotIs = (a: Slot, b: Slot) =>
  a.householdId === b.householdId && a.day === b.day && a.meal === b.meal
export const mealIcons = { breakfast: Sunrise, lunch: Sun, dinner: Moon }
export type OpenMeal = (s: Slot) => void

export function Chip({
  children,
  tone = 'neutral',
}: {
  children: ReactNode
  tone?: 'neutral' | 'green' | 'terra' | 'amber'
}) {
  return <span className={'chip ' + tone}>{children}</span>
}
export function PlanStatus() {
  const { planLabel } = useWork()
  const Icon =
    planLabel === 'Approved' ? Check : planLabel === 'Out of date' ? AlertCircle : CircleDashed
  return (
    <Chip
      tone={planLabel === 'Approved' ? 'green' : planLabel === 'Out of date' ? 'terra' : 'amber'}
    >
      <Icon />
      {planLabel === 'Draft' ? 'Draft plan' : planLabel}
    </Chip>
  )
}
export function StaleBanner() {
  const { approved, snapshot, planLabel } = useWork()
  if (planLabel !== 'Out of date' && (!approved || approved.revision === snapshot.revision))
    return null
  return (
    <div className="note warning" role="status">
      <AlertCircle size={18} />
      <span>
        {planLabel === 'Out of date' && (
          <>
            {approved
              ? 'Out of date. An older approved plan still reserves stock. '
              : 'Out of date. This is an unapproved preview. '}
            Recalculate in the food bank before using these meals or packing lists.
          </>
        )}
        {planLabel !== 'Out of date' &&
          'The previous approved plan is out of date. Its reservations remain active until you approve this draft or release the plan.'}
      </span>
    </div>
  )
}
export function PageTitle({
  title,
  subtitle,
  children,
  badge,
}: {
  title: string
  subtitle: string
  children?: ReactNode
  badge?: ReactNode
}) {
  return (
    <header className="page-title">
      <div>
        <div className="title-line">
          <h1>{title}</h1>
          {badge}
        </div>
        <p>{subtitle}</p>
      </div>
      {children && <div className="actions">{children}</div>}
    </header>
  )
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}
export function HouseholdSelect({
  value,
  onChange,
}: {
  value: string
  onChange: (id: string) => void
}) {
  const { snapshot } = useWork()
  return (
    <Field label="Demo household">
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {snapshot.households.map((h) => (
          <option key={h.id} value={h.id}>
            {h.name}
          </option>
        ))}
      </select>
    </Field>
  )
}
export function DaySelect({ value, onChange }: { value: number; onChange: (day: number) => void }) {
  return (
    <Field label="Meal day">
      <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
        {DAYS.map((d, i) => (
          <option key={d} value={i}>
            {d}
          </option>
        ))}
      </select>
    </Field>
  )
}
export function Modal({
  title,
  sub,
  children,
  onClose,
}: {
  title: string
  sub?: string
  children: ReactNode
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null),
    titleId = useId()
  useEffect(() => {
    const d = ref.current
    d?.showModal()
    return () => {
      d?.close()
    }
  }, [])
  return (
    <dialog
      className="modal"
      ref={ref}
      aria-labelledby={titleId}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const box = e.currentTarget.getBoundingClientRect()
          if (
            e.clientX < box.left ||
            e.clientX > box.right ||
            e.clientY < box.top ||
            e.clientY > box.bottom
          )
            onClose()
        }
      }}
    >
      <div className="modal-inner">
        <div className="modal-top">
          <div>
            {sub && <p className="context-line">{sub}</p>}
            <h2 id={titleId}>{title}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}>
            <X size={19} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  )
}
export function Reasons({ reasons }: { reasons: Reason[] }) {
  const { snapshot } = useWork()
  if (!reasons.length) return <p className="muted">No eligible whole-household batch was found.</p>
  const ids = [...new Set(reasons.map((r) => r.recipeId))]
  return (
    <div className="reason-list">
      {ids.map((id) => (
        <div key={id ?? 'all'}>
          {id && <strong>{snapshot.recipes.find((r) => r.id === id)?.name ?? id}</strong>}
          <ul>
            {reasons
              .filter((r) => r.recipeId === id)
              .map((r, i) => (
                <li key={i}>{r.message}</li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
export function MethodInfo({ method }: { method: RecipeMethod }) {
  const { snapshot } = useWork()
  return (
    <div className="method-info">
      <h3>{method.name}</h3>
      <div className="method-meta">
        <span>
          <Clock3 size={15} />
          {method.minutes} min · demo estimate
        </span>
      </div>
      <dl className="method-data">
        <dt>Appliances</dt>
        <dd>
          {method.appliances
            .map((id) => snapshot.appliances.find((a) => a.id === id)?.name ?? pretty(id))
            .join(', ') || 'No heat'}
        </dd>
        <dt>Tools</dt>
        <dd>{method.tools.map(pretty).join(', ') || 'None'}</dd>
        <dt>Utilities</dt>
        <dd>{method.utilities.map(pretty).join(', ') || 'None'}</dd>
        <dt>Water</dt>
        <dd>{method.water || 'None required'}</dd>
      </dl>
      <ol className="steps">
        {method.steps.map((step, i) => (
          <li key={i}>{step}</li>
        ))}
      </ol>
    </div>
  )
}
export function MealIcon({ meal, size = 16 }: { meal: Meal; size?: number }) {
  const Icon = mealIcons[meal]
  return <Icon size={size} />
}
