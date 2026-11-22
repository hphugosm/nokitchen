import { auditRecipe, packageDescription } from '../domain/audit'
import { useMemo, useState } from 'react'
import {
  BookOpen,
  Check,
  ChevronDown,
  CircleOff,
  Pencil,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react'
import { reservedByLot } from '../application/selectors'
import { assessRecipe } from '../domain/engine'
import { catalogRows, declaredDiets } from '../data/catalogCompatibility'
import { recipeAllergens } from '../domain/validation'
import { DAYS, type Household, type Recipe, type StockLot } from '../domain/types'
import {
  applianceNames,
  Chip,
  DaySelect,
  Field,
  fmt,
  HouseholdSelect,
  ingredientFor,
  MethodInfo,
  Modal,
  PageTitle,
  personCount,
  plural,
  pretty,
  Reasons,
  StaleBanner,
  useWork,
} from './shared'

function EditLot({ lot, onClose }: { lot: StockLot; onClose: () => void }) {
  const { snapshot, editStock, notice } = useWork(),
    ingredient = ingredientFor(snapshot, lot.ingredientId)
  const [value, setValue] = useState(String(lot.quantityBaseUnits)),
    [error, setError] = useState(false)
  return (
    <Modal
      title={'Edit ' + ingredient.name.toLowerCase()}
      sub={lot.id + ' · Inventory lot'}
      onClose={onClose}
    >
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault()
          if (editStock(lot.id, Number(value))) onClose()
          else setError(true)
        }}
      >
        <p>
          {lot.canRepack
            ? 'This lot can be measured in individual base units.'
            : 'This lot holds sealed packages of ' +
              fmt(lot.packageSize) +
              ' ' +
              ingredient.unit +
              ' each.'}
        </p>
        <Field label={'On hand (' + ingredient.unit + ')'}>
          <input
            type="number"
            required
            min="0"
            step={lot.canRepack ? 1 : lot.packageSize}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
        {error && (
          <div className="note warning" role="alert">
            {notice?.text ?? 'Check the quantity and active reservations.'}
          </div>
        )}
        <div className="actions">
          <button className="button" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" type="submit">
            Save quantity
          </button>
        </div>
      </form>
    </Modal>
  )
}
export function Inventory() {
  const { snapshot, approved, draft, release } = useWork()
  const [query, setQuery] = useState(''),
    [edit, setEdit] = useState<StockLot | null>(null)
  const active = reservedByLot(approved),
    preview = reservedByLot(draft)
  const ingredients = snapshot.ingredients.filter((i) =>
    i.name.toLowerCase().includes(query.toLowerCase()),
  )
  return (
    <>
      <PageTitle
        title="Inventory"
        subtitle="Track received stock, approved reservations, and free quantities."
      >
        {approved && (
          <button className="button" onClick={release}>
            Release approved plan
          </button>
        )}
      </PageTitle>
      <StaleBanner />
      <div className="panel">
        <div className="panel-head">
          <div>
            <h2>Ingredient inventory</h2>
            <p>
              {plural(snapshot.ingredients.length, 'ingredient')} ·{' '}
              {plural(snapshot.lots.length, 'lot')}
            </p>
          </div>
          <label className="search">
            <Search />
            <input
              aria-label="Find an ingredient"
              placeholder="Find an ingredient"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="inventory-head inventory-line">
          <span>Ingredient</span>
          <span>On hand</span>
          <span>Reserved</span>
          <span>Free</span>
          <span />
        </div>
        {ingredients.map((i) => {
          const lots = snapshot.lots.filter((l) => l.ingredientId === i.id),
            received = lots.filter(
              (l) =>
                l.received &&
                l.reviewStatus === 'demo' &&
                i.reviewStatus === 'demo' &&
                i.declaration === 'declared' &&
                i.allergens !== null,
            ),
            onHand = received.reduce((s, l) => s + l.quantityBaseUnits, 0),
            reserved = received.reduce((s, l) => s + (active[l.id] ?? 0), 0)
          return (
            <details className="stock-record" key={i.id}>
              <summary className="inventory-line">
                <span>
                  <strong>{i.name}</strong>
                  <small>
                    {i.unit} · {plural(lots.length, 'lot')}
                  </small>
                </span>
                <span>
                  {fmt(onHand)} <small>{i.unit}</small>
                </span>
                <span>
                  {fmt(reserved)} <small>{i.unit}</small>
                </span>
                <span className="stock-free">
                  {fmt(onHand - reserved)} <small>{i.unit}</small>
                </span>
                <ChevronDown />
              </summary>
              <div className="stock-detail">
                <div className="meta-line">
                  <ShieldCheck size={16} />
                  Demo declaration ·{' '}
                  {i.declaration === 'declared' && i.allergens !== null
                    ? i.allergens.map(pretty).join(', ') || 'No declared allergens'
                    : 'Needs review'}{' '}
                  · {i.provenance}
                </div>
                <p>{i.edibleBasis}</p>
                {lots.map((l) => (
                  <div className="lot-card" key={l.id}>
                    <div className="lot-title">
                      <strong>{l.id}</strong>
                      <Chip
                        tone={
                          l.reviewStatus === 'demo' &&
                          i.reviewStatus === 'demo' &&
                          i.declaration === 'declared' &&
                          i.allergens !== null
                            ? 'green'
                            : 'terra'
                        }
                      >
                        {l.reviewStatus === 'demo' &&
                        i.reviewStatus === 'demo' &&
                        i.declaration === 'declared' &&
                        i.allergens !== null
                          ? 'Demo reviewed'
                          : 'Needs review'}
                      </Chip>
                    </div>
                    <dl className="lot-data">
                      <dt>
                        {received.includes(l)
                          ? 'On hand / reserved / free'
                          : 'Recorded quantity under review'}
                      </dt>
                      <dd>
                        {received.includes(l)
                          ? [
                              l.quantityBaseUnits,
                              active[l.id] ?? 0,
                              l.quantityBaseUnits - (active[l.id] ?? 0),
                            ]
                              .map(fmt)
                              .join(' / ')
                          : fmt(l.quantityBaseUnits)}{' '}
                        {i.unit}
                      </dd>
                      <dt>Packaging</dt>
                      <dd>
                        {l.canRepack
                          ? 'Repackable in ' + i.unit
                          : plural(l.packageCount ?? 0, 'package') +
                            ' × ' +
                            l.packageSize +
                            ' ' +
                            i.unit}{' '}
                        {' · ' + packageDescription(l)}
                      </dd>
                      <dt>Pickup / usable through</dt>
                      <dd>
                        {DAYS[l.availableFromDay] ?? 'Day ' + l.availableFromDay} /{' '}
                        {DAYS[l.usableThroughDay] ?? 'Day ' + l.usableThroughDay}
                      </dd>
                      <dt>Storage before / after opening</dt>
                      <dd>
                        {pretty(l.storage)} / {pretty(l.afterOpening)}
                      </dd>
                      <dt>Source</dt>
                      <dd>{l.provenance}</dd>
                      {draft && (
                        <>
                          <dt>
                            Draft preview
                            {draft.revision !== snapshot.revision ? ' · out of date' : ''}
                          </dt>
                          <dd>
                            {fmt(preview[l.id] ?? 0)} {i.unit}
                          </dd>
                        </>
                      )}
                    </dl>
                    <button className="button" onClick={() => setEdit(l)}>
                      <Pencil />
                      Edit quantity
                    </button>
                  </div>
                ))}
                {lots.length === 0 && <p>No lots received.</p>}
              </div>
            </details>
          )
        })}
        {ingredients.length === 0 && (
          <div className="empty-view">No ingredients match this search.</div>
        )}
      </div>
      {edit && <EditLot lot={edit} onClose={() => setEdit(null)} />}
    </>
  )
}

export function Households() {
  const { snapshot, plan, navigate } = useWork()
  return (
    <>
      <PageTitle
        title="Households"
        subtitle="Inspect kitchen equipment, restrictions, and weekly allocations."
      />
      <StaleBanner />
      <div className="record-grid">
        {snapshot.households.map((h, i) => {
          const allocated = (plan?.allocations ?? [])
              .filter((a) => a.householdId === h.id)
              .reduce((s, a) => s + a.portions, 0),
            missing = (plan?.unfilled ?? [])
              .filter((a) => a.householdId === h.id)
              .reduce((s, a) => s + a.requested, 0)
          return (
            <article className="panel record" key={h.id}>
              <div className="record-head">
                <span className={'house-avatar large tone-' + (i % 4)}>
                  <Users />
                </span>
                <div>
                  <h2>{h.name}</h2>
                  <span>{personCount(h.peopleCount)}</span>
                </div>
              </div>
              <dl className="detail-list">
                <dt>Equipment</dt>
                <dd>{applianceNames(snapshot, h).join(', ') || 'No cooking appliance'}</dd>
                <dt>Cold storage</dt>
                <dd>{h.storage.map(pretty).join(', ') || 'None'}</dd>
                <dt>Restrictions</dt>
                <dd>
                  {[
                    ...h.allergens.map(pretty),
                    ...h.excludedIngredientIds.map((id) => ingredientFor(snapshot, id).name),
                  ].join(', ') || 'None declared'}
                </dd>
                <dt>Allocated portions</dt>
                <dd>
                  {allocated} / {allocated + missing}
                </dd>
              </dl>
              <button className="button" onClick={() => navigate('household', undefined, h.id)}>
                Open household
              </button>
            </article>
          )
        })}
      </div>
    </>
  )
}

function RecipeDetails({
  recipe,
  household,
  day,
  onClose,
}: {
  recipe: Recipe
  household: Household
  day: number
  onClose: () => void
}) {
  const { snapshot } = useWork()
  const test = assessRecipe(snapshot, household, recipe, day)
  const audit = useMemo(() => auditRecipe(snapshot, recipe), [snapshot, recipe])
  const { allergens, reviewStatus } = recipeAllergens(recipe, snapshot.ingredients)
  const diets = declaredDiets(recipe, snapshot.ingredients)
  return (
    <Modal title={recipe.name} sub={recipe.id + ' · Demo recipe'} onClose={onClose}>
      <div className="note">
        <BookOpen />
        <span>
          {household.name} · {DAYS[day]} ·{' '}
          {test.feasible
            ? 'Compatible with ' +
              (recipe.methods.find((m) => m.id === test.methodId)?.name ?? 'an authored method')
            : 'No complete batch available'}
        </span>
      </div>
      {!test.feasible && <Reasons reasons={test.reasons} />}
      <div className="subsection">
        <h3>Ingredients per demo portion</h3>
        <ul className="lined-list">
          {recipe.required.map((q) => (
            <li key={q.ingredientId}>
              {ingredientFor(snapshot, q.ingredientId).name}
              <strong>
                {q.quantity} {ingredientFor(snapshot, q.ingredientId).unit}
              </strong>
            </li>
          ))}
        </ul>
        <p className="muted">
          Declared allergens:{' '}
          {reviewStatus === 'demo'
            ? allergens.map(pretty).join(', ') || 'None declared in these demo variants'
            : 'Needs review'}
        </p>
        <p className="muted">
          Meal type · {pretty(recipe.familyId ?? 'unclassified')}. Dietary compatibility of the
          required demo products · {diets?.map(pretty).join(', ') || 'Requires review'}.
        </p>
        <p className="muted">{recipe.provenance}</p>
        {recipe.optional.length > 0 && (
          <p className="muted">
            Optional, omitted from meal kits:{' '}
            {recipe.optional
              .map(
                (q) =>
                  ingredientFor(snapshot, q.ingredientId).name +
                  ' (' +
                  q.quantity +
                  ' ' +
                  ingredientFor(snapshot, q.ingredientId).unit +
                  ')',
              )
              .join(', ')}
            .
          </p>
        )}
      </div>
      <details className="meal-links">
        <summary>{audit.passed ? 'Passed model checks' : 'Model findings require review'}</summary>
        <div>
          <p className="muted">Synthetic product, package, and method audit.</p>
          {audit.findings.map((f, i) => (
            <div key={i} className="audit-finding">
              <strong>{f.code}</strong>
              <p>{f.evidence}</p>
              <small>{f.resolution}</small>
            </div>
          ))}
        </div>
      </details>
      {recipe.methods.map((m) => (
        <MethodInfo method={m} key={m.id} />
      ))}
    </Modal>
  )
}
export function Recipes() {
  const { snapshot, householdId, selectHousehold, plan } = useWork()
  const household = snapshot.households.find((h) => h.id === householdId)!
  const [day, setDay] = useState(0)
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [mealType, setMealType] = useState<'all' | 'breakfast' | 'lunch' | 'dinner'>('all')
  const [family, setFamily] = useState('all')
  const [layer, setLayer] = useState('all')
  const rows = useMemo(
    () => catalogRows(snapshot, household, day, plan, mealType === 'all' ? undefined : mealType),
    [snapshot, household, day, plan, mealType],
  )
  const families = [
    ...new Set(snapshot.recipes.map((recipe) => recipe.familyId ?? 'unclassified')),
  ].sort()
  const subset = rows.filter(
    ({ recipe }) =>
      (mealType === 'all' || recipe.mealTypes.some((meal) => meal === mealType)) &&
      (family === 'all' || recipe.familyId === family),
  )
  const visible = subset.filter(
    (row) =>
      layer === 'all' ||
      (layer === 'kitchen' && row.kitchenMethods.length > 0) ||
      (layer === 'stock' && row.batch.feasible) ||
      (layer === 'allocated' && row.allocated > 0),
  )
  const assigned = subset.filter((row) => row.allocated > 0)
  const familyCount = (items: typeof rows) => new Set(items.map((row) => row.recipe.familyId)).size
  const weekly = subset.filter((row) => row.weekPortions > 0)

  return (
    <>
      <PageTitle
        title="Recipes"
        subtitle="Check which meals this household can prepare and which ones its plan actually provides."
      />
      <div className="panel filters">
        <HouseholdSelect value={householdId} onChange={selectHousehold} />
        <DaySelect value={day} onChange={setDay} />
        <Field label="Meal time">
          <select
            aria-label="Meal time"
            value={mealType}
            onChange={(e) => setMealType(e.target.value as typeof mealType)}
          >
            <option value="all">All meals</option>
            {['breakfast', 'lunch', 'dinner'].map((meal) => (
              <option key={meal} value={meal}>
                {pretty(meal)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Meal type">
          <select
            aria-label="Meal type"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
          >
            <option value="all">All meal types</option>
            {families.map((id) => (
              <option key={id} value={id}>
                {pretty(id)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Compatibility">
          <select
            aria-label="Compatibility"
            value={layer}
            onChange={(e) => setLayer(e.target.value)}
          >
            <option value="all">Whole catalog</option>
            <option value="kitchen">Kitchen method available</option>
            <option value="stock">Full batch available</option>
            <option value="allocated">Allocated on selected day</option>
          </select>
        </Field>
      </div>
      <StaleBanner />
      <div className="section-heading">
        <div>
          <h2>Recipe catalog</h2>
          <p>
            {plural(subset.length, 'catalog recipe')} ·{' '}
            {subset.filter((r) => r.kitchenMethods.length).length} with a suitable kitchen method ·{' '}
            {subset.filter((r) => r.batch.feasible).length} with a feasible full batch
          </p>
          <p>
            Allocated on {DAYS[day]} · {plural(assigned.length, 'recipe')} in{' '}
            {plural(familyCount(assigned), 'meal type')}
          </p>
          <p>
            Allocated across the week · {plural(weekly.length, 'recipe')} in{' '}
            {plural(familyCount(weekly), 'meal type')}. Standalone batches each start with
            the same received stock.
          </p>
        </div>
      </div>
      {!visible.length && (
        <div className="panel empty-view">
          <h3>No recipes match these filters</h3>
          <p>Change the meal time, meal type or compatibility filter to see more recipes.</p>
        </div>
      )}
      <div className="record-grid">
        {visible.map(({ recipe, kitchenMethods, batch, capacity, allocated }) => (
          <article className="panel record" key={recipe.id}>
            <div className="record-meta">
              <span>
                {recipe.id} · {recipe.mealTypes.map(pretty).join(' / ')}
              </span>
              <Chip tone={batch.feasible ? 'green' : 'neutral'}>
                {batch.feasible ? <Check /> : <CircleOff />}
                {batch.feasible ? 'Ready with current stock' : 'Unavailable'}
              </Chip>
            </div>
            <h2>{recipe.name}</h2>
            <p>{pretty(recipe.familyId ?? 'unclassified')}</p>
            <dl className="detail-list">
              <dt>Available kitchen method</dt>
              <dd>
                {recipe.methods
                  .filter((m) => kitchenMethods.includes(m.id))
                  .map((m) => m.name)
                  .join(' or ') || 'None'}
              </dd>
              <dt>Standalone capacity</dt>
              <dd>{plural(capacity, 'portion')}</dd>
              <dt>Allocated on selected day</dt>
              <dd>{plural(allocated, 'portion')}</dd>
            </dl>
            <button className="button" onClick={() => setSelected(recipe)}>
              <BookOpen />
              Recipe details
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <RecipeDetails
          recipe={selected}
          household={household}
          day={day}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  )
}
