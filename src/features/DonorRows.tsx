import type { ReactNode } from 'react'
import { DAYS, type Catalog } from '../domain/types'
import type { OfferRow } from '../domain/donorTypes'
import { packageKinds, rowIssues } from '../integrations/donations/parser'
import { Chip, pretty } from './shared'

import { rowFields } from '../domain/donorChanges'
export { rowFields, differences } from '../domain/donorChanges'
type Editable = keyof typeof rowFields

export function DonorRows({
  rows,
  onChange,
  catalog,
  weekStart,
}: {
  rows: OfferRow[]
  onChange: (rows: OfferRow[]) => void
  catalog: Catalog
  weekStart: string
}) {
  const replace = (row: OfferRow) => onChange(rows.map((r) => (r.id === row.id ? row : r)))
  return (
    <div className="donor-rows">
      {rows.map((r, i) => (
        <Row
          key={r.id}
          row={r}
          number={i + 1}
          onChange={replace}
          catalog={catalog}
          weekStart={weekStart}
        />
      ))}
    </div>
  )
}
function Row({
  row: r,
  number,
  onChange,
  catalog,
  weekStart,
}: {
  row: OfferRow
  number: number
  onChange: (r: OfferRow) => void
  catalog: Catalog
  weekStart: string
}) {
  const product = catalog.ingredients.find((item) => item.id === r.ingredientId)
  const set = <K extends Editable>(field: K, value: OfferRow[K]) => {
    const next = {
      ...r,
      [field]: value,
      edits: { ...r.edits, [field]: 'Operator entered or confirmed ' + String(value ?? 'unknown') },
    }
    if (field === 'ingredientId') next.match = value ? 'operator' : 'unknown'
    onChange(next)
  }
  const field = (key: Editable, element: ReactNode) => (
    <div className="donor-field-group">
      <label className="donor-field">
        <span>{rowFields[key]}</span>
        {element}
      </label>
      {r.evidence[key] &&
        ['quantity', 'packageSize', 'basis', 'deliveryDate', 'expiryDate'].includes(key) && (
          <details className="donor-phrase">
            <summary>Source phrase</summary>
            <q>{r.evidence[key]}</q>
          </details>
        )}
    </div>
  )
  function options<K extends Editable>(key: K, values: (string | number)[], names?: string[]) {
    return field(
      key,
      <select
        aria-label={rowFields[key]}
        value={r[key] === null ? '' : String(r[key])}
        onChange={(e) => {
          const value = e.target.value
          const convert =
            value === ''
              ? null
              : key === 'canRepack' || key === 'requiresCanOpener'
                ? value === 'true'
                : key === 'availableFromDay' || key === 'usableThroughDay'
                  ? Number(value)
                  : value
          set(key, convert as OfferRow[K])
        }}
      >
        <option value="">Select or confirm</option>
        {values.map((v, i) => (
          <option value={String(v)} key={v}>
            {names?.[i] ?? pretty(String(v))}
          </option>
        ))}
      </select>,
    )
  }
  const numberField = (k: 'quantity' | 'packageCount' | 'packageSize') =>
    field(
      k,
      <input
        type="number"
        min="1"
        step="1"
        aria-label={rowFields[k]}
        value={r[k] ?? ''}
        onChange={(e) => set(k, e.target.value === '' ? null : Number(e.target.value))}
      />,
    )
  const dateField = (k: 'deliveryDate' | 'expiryDate') =>
    field(
      k,
      <input
        type="date"
        aria-label={rowFields[k]}
        value={r[k] ?? ''}
        onChange={(e) => set(k, e.target.value || null)}
      />,
    )
  const issues = rowIssues(r, catalog, weekStart)
  return (
    <fieldset className="donor-item">
      <legend>
        Item {number} · Line {r.line}
      </legend>
      <div className="donor-source">
        <q>{r.sourceText}</q>
        <Chip tone={r.excludedReason !== null ? 'neutral' : issues.length ? 'amber' : 'green'}>
          {r.excludedReason !== null
            ? 'Excluded'
            : issues.length
              ? 'Needs review'
              : 'Ready for review'}
        </Chip>
      </div>
      <label className="toggle">
        <input
          type="checkbox"
          checked={r.excludedReason !== null}
          onChange={(e) => set('excludedReason', e.target.checked ? '' : null)}
        />
        Exclude this item
      </label>
      {r.excludedReason !== null ? (
        field(
          'excludedReason',
          <input
            aria-label="Exclusion reason"
            value={r.excludedReason}
            onChange={(e) => set('excludedReason', e.target.value)}
          />,
        )
      ) : (
        <>
          <div className="donor-grid donor-identification">
            {options(
              'ingredientId',
              catalog.ingredients.map((p) => p.id),
              catalog.ingredients.map((p) => p.name),
            )}
            {product && (
              <div className="donor-product">
                <strong>Synthetic catalog declaration</strong>
                <p>{product.edibleBasis}</p>
                <p>
                  Declared allergens ·{' '}
                  {product.declaration === 'declared' && Array.isArray(product.allergens)
                    ? product.allergens.map(pretty).join(', ') || 'None declared'
                    : 'Needs review'}
                </p>
              </div>
            )}
          </div>
          <div className="donor-grid">
            {numberField('quantity')}
            {options('unit', ['g', 'ml', 'each'], ['g', 'ml', 'each'])}
            {options('basis', ['edible', 'drained', 'net'])}
            {numberField('packageCount')}
            {numberField('packageSize')}
            {options('packageKind', packageKinds)}
            {options('requiresCanOpener', ['true', 'false'], ['Yes', 'No'])}
            {options('canRepack', ['true', 'false'], ['Yes', 'No'])}
            {options('storage', ['ambient', 'fridge', 'freezer'])}
            {options('afterOpening', ['ambient', 'fridge', 'freezer'])}
            {dateField('deliveryDate')}
            {options('expiryType', ['best-before', 'use-by'])}
            {dateField('expiryDate')}
            {options('availableFromDay', [0, 1, 2, 3, 4, 5, 6], [...DAYS])}
            {options('usableThroughDay', [0, 1, 2, 3, 4, 5, 6], [...DAYS])}
          </div>
          {r.canRepack === false &&
          r.packageCount &&
          r.packageSize &&
          r.quantity !== r.packageCount * r.packageSize ? (
            <button
              className="button"
              onClick={() => set('quantity', r.packageCount! * r.packageSize!)}
            >
              Use package total ({r.packageCount * r.packageSize} {r.unit})
            </button>
          ) : null}
        </>
      )}
      {!!issues.length && (
        <ul className="donor-issues">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      <details className="meal-links">
        <summary>Field evidence and operator edits</summary>
        <div>
          <p>
            Product match: {r.match}. Message characters {r.span[0] + 1}–{r.span[1]}.
          </p>
          <dl className="donor-evidence">
            {(Object.keys(rowFields) as Editable[])
              .filter((k) => r.evidence[k] || r.edits[k])
              .map((k) => (
                <div key={k}>
                  <dt>{rowFields[k]}</dt>
                  <dd>
                    {r.evidence[k] && <q>{r.evidence[k]}</q>}
                    {r.edits[k] && <span>{r.edits[k]}</span>}
                  </dd>
                </div>
              ))}
          </dl>
        </div>
      </details>
    </fieldset>
  )
}
