import { useEffect, useRef, useState } from 'react'
import {
  AlertCircle,
  BookOpen,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  Compass,
  Scale,
  SearchCheck,
  Check,
  ChevronRight,
  FlaskConical,
  HandHeart,
  House,
  ListChecks,
  Menu,
  RotateCcw,
  ShoppingBasket,
  SlidersHorizontal,
  Soup,
  Sprout,
  Users,
  Warehouse,
  X,
} from 'lucide-react'
import type { BankView, WorkspaceUI } from '../application/uiContract'
import { collectionForDay, type Collection, type Slot } from '../domain/types'
import Overview from './Overview'
import { Households, Inventory, Recipes } from './Records'
import { Packing } from './Packing'
import Donations from './Donations'
import HouseholdPortal, { type HouseholdView } from './Household'
import { Modal, WorkContext } from './shared'
import { MealDetail } from './MealDetail'
import Needs from './Needs'
import Compare from './Compare'
import WhatIf from './WhatIf'
import { TourPanel } from './Tour'
import './insights.css'
import './workspace.css'

const bankLinks = [
  { id: 'overview', name: 'Weekly plan', Icon: CalendarDays },
  { id: 'donations', name: 'Donations', Icon: HandHeart },
  { id: 'households', name: 'Households', Icon: Users },
  { id: 'packing', name: 'Packing lists', Icon: ListChecks },
  { id: 'inventory', name: 'Inventory', Icon: Boxes },
  { id: 'recipes', name: 'Recipes', Icon: BookOpen },
] as const
const analysisLinks = [
  { id: 'needs', name: 'Unmet needs', Icon: SearchCheck },
  { id: 'compare', name: 'Compare planners', Icon: Scale },
  { id: 'whatif', name: 'What would help?', Icon: ChartNoAxesCombined },
] as const
const householdLinks = [
  { id: 'schedule', name: 'Meal schedule', Icon: CalendarDays },
  { id: 'boxes', name: 'Box contents', Icon: ShoppingBasket },
  { id: 'settings', name: 'Kitchen settings', Icon: SlidersHorizontal },
] as const

export default function Workspace(ui: WorkspaceUI) {
  const [slot, setSlot] = useState<Slot | null>(null),
    [confirmReset, setConfirmReset] = useState(false),
    [houseView, setHouseView] = useState<HouseholdView>('schedule'),
    [menu, setMenu] = useState(false)
  const [completedVisit, setCompletedVisit] = useState<number | null>(null)
  const [collection, setCollection] = useState<Collection>()
  const markComplete = () => {
    if (ui.tour.active) setCompletedVisit(ui.tour.visit)
  }
  function openMeal(s: Slot) {
    setSlot(s)
  }
  function showBoxes() {
    ui.navigate('household', undefined, ui.householdId)
    setHouseView('boxes')
    if (ui.tour.active && ui.tour.step === 6) markComplete()
  }
  function openBox(s: Slot) {
    setSlot(null)
    setCollection(collectionForDay(s.day))
    if (ui.mode === 'household') {
      ui.selectHousehold(s.householdId)
      setHouseView('boxes')
    } else {
      ui.navigate('bank', 'packing', s.householdId)
    }
    if (ui.tour.active && ui.tour.step === 6) markComplete()
  }
  useEffect(() => {
    setSlot(null)
    setMenu(false)
    setCollection(undefined)
    setHouseView('schedule')
  }, [ui.tour.visit, ui.tour.active])
  const menuToggle = useRef<HTMLButtonElement>(null),
    drawer = useRef<HTMLElement>(null)
  const operator = __OPERATOR_MODE__ && !ui.tour.active
  const bank = ui.mode === 'bank'
  useEffect(() => {
    setSlot(null)
    setMenu(false)
    setHouseView('schedule')
    window.scrollTo(0, 0)
  }, [ui.mode, ui.bankView])
  useEffect(() => {
    if (!menu) return
    const sidebar = drawer.current
    const buttons = sidebar?.querySelectorAll<HTMLButtonElement>('button')
    buttons?.[0]?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenu(false)
      if (event.key !== 'Tab' || !buttons?.length) return
      const target = event.shiftKey ? buttons[buttons.length - 1] : buttons[0]
      if (document.activeElement === (event.shiftKey ? buttons[0] : buttons[buttons.length - 1])) {
        event.preventDefault()
        target.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      menuToggle.current?.focus()
    }
  }, [menu])
  const changeBank = (id: BankView) => {
    setCollection(undefined)
    setMenu(false)
    ui.navigate('bank', id)
  }
  const navButton = (
    label: string,
    id: string,
    Icon: typeof CalendarDays,
    active: boolean,
    run: () => void,
  ) => (
    <button
      key={id}
      className={'nav-item ' + (active ? 'active' : '')}
      aria-current={active ? 'page' : undefined}
      onClick={run}
    >
      <Icon />
      {label}
    </button>
  )
  const title = bank
    ? [...bankLinks, ...analysisLinks].find((l) => l.id === ui.bankView)?.name
    : householdLinks.find((l) => l.id === houseView)?.name
  return (
    <WorkContext.Provider value={ui}>
      <div className="workspace">
        <a
          className="skip-link"
          href="#main-content"
          onClick={(e) => {
            e.preventDefault()
            document.getElementById('main-content')?.focus()
          }}
        >
          Skip to content
        </a>
        {menu && (
          <button className="nav-backdrop" aria-label="Close menu" onClick={() => setMenu(false)} />
        )}
        <aside
          ref={drawer}
          className={'sidebar ' + (menu ? 'shown' : '')}
          aria-label="Workspace navigation"
        >
          <div className="brand-area">
            <span className="brand-icon">
              <Soup />
            </span>
            <span className="brand-name">NoKitchen</span>
            <button
              className="icon-button mobile-close"
              aria-label="Close navigation"
              onClick={() => setMenu(false)}
            >
              <X />
            </button>
          </div>
          <div className="nav-scroll">
            <span className="nav-label">{bank ? 'Food bank' : 'Household'} workspace</span>
            <nav aria-label={bank ? 'Food bank workspace' : 'Household workspace'}>
              {bank
                ? bankLinks.map(({ id, name, Icon }) =>
                    navButton(name, id, Icon, ui.bankView === id, () => changeBank(id)),
                  )
                : householdLinks.map(({ id, name, Icon }) =>
                    navButton(name, id, Icon, houseView === id, () => {
                      setHouseView(id)
                      if (ui.tour.active && ui.tour.step === 6 && id === 'boxes') markComplete()
                      setMenu(false)
                      window.scrollTo(0, 0)
                    }),
                  )}
            </nav>
            {bank && (
              <>
                <div className="nav-divider" />
                <span className="nav-label">{ui.tour.active ? 'Plan analysis' : 'Analysis and demo'}</span>
                <nav aria-label="Plan analysis and guided demo">
                  {analysisLinks.map(({ id, name, Icon }) =>
                    navButton(name, id, Icon, ui.bankView === id, () => changeBank(id)),
                  )}
                  {!ui.tour.active && (
                    <button
                      className="nav-item"
                      onClick={() => {
                        setMenu(false)
                        ui.tour.start()
                      }}
                    >
                      <Compass />
                      Guided demo
                    </button>
                  )}
                </nav>
              </>
            )}
          </div>
          <div className="sidebar-footer">
            <div className="planner-note">
              <Sprout />
              <div>
                <strong>Rule-based planner</strong>
                <span>{operator ? 'Local operator workspace' : 'Local workspace'}</span>
              </div>
            </div>
            <button
              className="reset-button"
              onClick={() => {
                setConfirmReset(true)
                setMenu(false)
              }}
            >
              <RotateCcw />
              {operator ? 'Reset workspace' : 'Reset demo'}
            </button>
            <span className="signature">Jump-Powered by Tým Trampolín</span>
          </div>
        </aside>
        <div className="main-column">
          <header className="topbar">
            <button
              ref={menuToggle}
              className="icon-button mobile-toggle"
              aria-label="Open navigation"
              aria-expanded={menu}
              onClick={() => setMenu(true)}
            >
              <Menu />
            </button>
            <div className="crumb">
              <span>{bank ? 'Food bank' : 'Household'}</span>
              <ChevronRight />
              {title}
            </div>
            <div className="top-actions">
              <span className="demo-indicator">
                <FlaskConical />
                {operator ? 'Private Operator Mode' : 'Demo · synthetic data'}
              </span>
              <div className="mode-switch" role="group" aria-label="Portal">
                <button
                  aria-pressed={bank}
                  onClick={() => {
                    setMenu(false)
                    if (!bank) ui.navigate('bank', 'overview')
                  }}
                >
                  <Warehouse />
                  Food bank
                </button>
                <button
                  aria-pressed={!bank}
                  onClick={() => {
                    setMenu(false)
                    if (bank) ui.navigate('household', undefined, ui.householdId)
                  }}
                >
                  <House />
                  Household
                </button>
              </div>
            </div>
          </header>
          {ui.storageWarning && (
            <aside className="storage-warning" role="alert">
              <AlertCircle size={18} />
              <span>{ui.storageWarning}</span>
            </aside>
          )}
          <main id="main-content" tabIndex={-1} className="content">
            <TourPanel
              completed={completedVisit === ui.tour.visit}
              openMeal={openMeal}
              openBoxes={showBoxes}
            />

            {bank ? (
              ui.bankView === 'overview' ? (
                <Overview openMeal={openMeal} />
              ) : ui.bankView === 'needs' ? (
                <Needs openMeal={openMeal} />
              ) : ui.bankView === 'compare' ? (
                <Compare onTeachingViewed={markComplete} />
              ) : ui.bankView === 'whatif' ? (
                <WhatIf key={ui.tour.visit + ':' + ui.householdId} />
              ) : ui.bankView === 'inventory' ? (
                <Inventory />
              ) : ui.bankView === 'households' ? (
                <Households />
              ) : ui.bankView === 'recipes' ? (
                <Recipes />
              ) : ui.bankView === 'donations' ? (
                <Donations />
              ) : (
                <Packing key={collection} initialCollection={collection} openMeal={openMeal} />
              )
            ) : (
              <HouseholdPortal view={houseView} openMeal={openMeal} />
            )}
          </main>
        </div>
        {slot && <MealDetail slot={slot} onBox={openBox} onClose={() => setSlot(null)} />}
        {confirmReset && (
          <Modal
            title={operator ? 'Reset the operator workspace?' : 'Restore the starting demo week?'}
            sub="Local workspace"
            onClose={() => setConfirmReset(false)}
          >
            <p>
              {operator
                ? 'This replaces local households, stock, imported offers, approvals and the draft with the synthetic opening week. Completed emails retain their receipt status in the private inbox.'
                : 'This clears your local changes, donations, and approvals.'}
            </p>
            <div className="actions">
              <button className="button" onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
              <button
                className="button primary"
                onClick={() => {
                  ui.reset()
                  setConfirmReset(false)
                  setHouseView('schedule')
                }}
              >
                <RotateCcw />
                {operator ? 'Reset workspace' : 'Reset demo'}
              </button>
            </div>
          </Modal>
        )}
        {ui.notice && (
          <div
            className={'toast ' + (ui.notice.error ? 'error' : '')}
            role={ui.notice.error ? 'alert' : 'status'}
          >
            {ui.notice.error ? <AlertCircle /> : <Check />}
            <span>{ui.notice.text}</span>
            <button aria-label="Dismiss notification" onClick={ui.clearNotice}>
              <X size={16} />
            </button>
          </div>
        )}
      </div>
    </WorkContext.Provider>
  )
}
