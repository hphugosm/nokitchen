import { WeeklyVariety } from './Variety'
import { PlanActions, PolicySummary } from './Policy'
import { NeedsLink } from './Needs'
import {
  Check,
  CircleDashed,
  ClipboardList,
  CookingPot,
  Compass,
  Leaf,
  Minus,
  PackageCheck,
  RefreshCw,
  ShoppingBasket,
  Truck,
  Users,
  Wheat,
} from 'lucide-react'
import { DAYS, MEALS, collectionForDay } from '../domain/types'
import {
  Chip,
  PageTitle,
  PlanStatus,
  StaleBanner,
  fmt,
  personCount,
  plural,
  pretty,
  useWork,
  type OpenMeal,
} from './shared'

function Metrics() {
  const { plan, snapshot } = useWork()
  const m = plan?.metrics
  if (!m) return null
  const percent = Math.min(100, Math.max(0, m.percent))
  return (
    <div className="stats">
      <section className="stat coverage">
        <div className="stat-top">
          <span className="stat-icon">
            <Leaf />
          </span>
          <span>Plan coverage</span>
        </div>
        <div className="stat-value">
          {fmt(percent)}
          <small>%</small>
        </div>
        <span className="stat-foot">of requested portions</span>
        <div
          aria-hidden="true"
          className="coverage-ring"
          style={{
            background: `conic-gradient(from -90deg, #c8dba1 0% ${percent}%, #527263 ${percent}% 100%)`,
          }}
        >
          <div>
            <Wheat />
          </div>
        </div>
      </section>
      {[
        {
          label: 'Requested',
          value: m.requested,
          Icon: ClipboardList,
          kind: 'requested',
          detail: 'Across ' + plural(snapshot.households.length, 'household'),
        },
        {
          label: 'Allocated',
          value: m.allocated,
          Icon: PackageCheck,
          kind: 'allocated',
          detail: 'Portions in meal kits',
        },
        {
          label: 'Uncovered',
          value: m.uncovered,
          Icon: CircleDashed,
          kind: 'uncovered',
          detail: 'Portions still needed',
        },
      ].map(({ label, value, Icon, kind, detail }) => (
        <section className={'stat ' + kind} key={kind}>
          <div className="stat-top">
            <span className="stat-icon">
              <Icon />
            </span>
            <span>{label}</span>
          </div>
          <div className="stat-value">{fmt(value)}</div>
          <span className="stat-foot">{detail}</span>
        </section>
      ))}
    </div>
  )
}

function CollectionSummary() {
  const { plan, navigate } = useWork()
  if (!plan) return null
  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <h2>Collection schedule</h2>
        </div>
        <button className="text-button" onClick={() => navigate('bank', 'packing')}>
          <ShoppingBasket size={16} />
          Packing lists
        </button>
      </div>
      <div className="collection-row">
        {([0, 4] as const).map((day) => {
          const portions = plan.allocations
            .filter((a) => collectionForDay(a.day) === day)
            .reduce((s, a) => s + a.portions, 0)
          const boxes = plan.packingLists.filter(
            (p) => p.collectionDay === day && p.items.length > 0,
          ).length
          return (
            <div className="collection-tile" key={day}>
              <span className={'collection-icon ' + (day === 4 ? 'clay' : '')}>
                <Truck />
              </span>
              <div>
                <h3>{DAYS[day]} collection</h3>
                <p>{day === 0 ? 'Monday–Thursday' : 'Friday–Sunday'} meals</p>
              </div>
              <div className="collection-count">
                <strong>{plural(boxes, 'box', 'boxes')}</strong>
                <span>{plural(portions, 'portion')}</span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function Overview({ openMeal }: { openMeal: OpenMeal }) {
  const { plan, snapshot, previousDraft, approved, release, navigate, tour } = useWork()
  const slots = new Map(plan?.allocations.map((a) => [[a.householdId, a.day, a.meal].join(':'), a]))
  return (
    <>
      <PageTitle
        title="Weekly plan"
        subtitle="Allocate meal kits across households and collection days."
        badge={<PlanStatus />}
      >
        {!tour.active && (
          <button className="button" onClick={tour.start}>
            <Compass />
            Start guided demo
          </button>
        )}
      </PageTitle>
      <StaleBanner />
      <Metrics />
      <section className="panel decision-panel">
        <PolicySummary />
        <PlanActions />
      </section>
      <WeeklyVariety />
      <NeedsLink />
      {previousDraft && plan && previousDraft.revision !== plan.revision && (
        <div className="note">
          <RefreshCw />
          Previous calculation: {previousDraft.metrics.allocated} allocated portions. Current
          calculation: {plan.metrics.allocated}.
        </div>
      )}
      <section className="panel schedule-panel">
        <div className="panel-head">
          <div>
            <h2>Household meal schedule</h2>
            <p>Choose a meal slot to inspect its allocation.</p>
          </div>
          <div className="legend">
            <span>
              <i className="swatch filled">
                <Check />
              </i>
              Allocated
            </span>
            <span>
              <i className="swatch empty">
                <Minus />
              </i>
              Unfilled
            </span>
          </div>
        </div>
        {plan ? (
          <>
            <div className="table-scroll">
              <table className="week-grid">
                <thead>
                  <tr>
                    <th scope="col">
                      <span className="grid-house-label">Household</span>
                    </th>
                    {DAYS.map((day, i) => (
                      <th scope="col" className={i === 4 ? 'window-start' : ''} key={day}>
                        <span>{day.slice(0, 3)}</span>
                        {(i === 0 || i === 4) && (
                          <small>
                            <Truck size={12} />
                            Pickup
                          </small>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {snapshot.households.map((h, i) => (
                    <tr key={h.id}>
                      <th scope="row">
                        <button
                          className="house-name"
                          onClick={() => navigate('household', undefined, h.id)}
                        >
                          <span className={'house-avatar tone-' + (i % 4)}>
                            <Users />
                          </span>
                          <span>
                            {h.name}
                            <small>{personCount(h.peopleCount)}</small>
                          </span>
                        </button>
                      </th>
                      {DAYS.map((d, day) => (
                        <td key={d} className={day === 4 ? 'window-start' : ''}>
                          <div className="meal-trio">
                            {MEALS.map((meal) => {
                              const a = slots.get([h.id, day, meal].join(':'))
                              const r = a && snapshot.recipes.find((x) => x.id === a.recipeId)
                              const label = [h.name, d, pretty(meal), r?.name ?? 'Unfilled'].join(
                                ' · ',
                              )
                              return (
                                <button
                                  key={meal}
                                  className={'slot ' + (a ? 'filled' : 'empty')}
                                  aria-label={label}
                                  title={label}
                                  onClick={() => openMeal({ householdId: h.id, day, meal })}
                                >
                                  {a ? meal[0].toUpperCase() : <Minus size={13} />}
                                </button>
                              )
                            })}
                          </div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid-foot">
              <span>
                <CookingPot />B · Breakfast <b>/</b> L · Lunch <b>/</b> D · Dinner
              </span>
              <span>
                <Truck />
                Monday & Friday pickups
              </span>
            </div>
          </>
        ) : (
          <div className="empty-view">Recalculate to build the weekly meal plan.</div>
        )}
      </section>
      <CollectionSummary />
      {approved && (
        <div className="reservation-line">
          <Chip tone="green">
            <PackageCheck />
            Active reservations
          </Chip>
          <span>{plural(approved.metrics.allocated, 'portion')} in the approved plan</span>
          <button className="text-button" onClick={release}>
            Release approved plan
          </button>
        </div>
      )}
    </>
  )
}
