// The org chart: the home of an enterprise. The positions are grouped by department (a panel each, the lead first), every
// card says who holds it and on which project (the Office's colour and emoji); a filter picks one project, a zoom resizes
// the panels, a second view lists everything in a table. A click opens the position's panel (?pos=<id>); a card dragged
// onto another one (pointer, computer only) changes its lead. The top card (you, or the top position) is a drop target too.
import * as React from 'react'
import { useSearchParams } from 'react-router'
import { ChevronDown, LayoutGrid, List, Plus, TriangleAlert, UserRound, UsersRound, ZoomIn, ZoomOut } from 'lucide-react'
import { useT } from '@/i18n'
import type { Enterprise, Position } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Button, EmptyState, Segmented, Sensitive, StatusDot, Tooltip } from '@/components/ui'
import { Callout } from '@/features/common'
import { AgentAvatarIcon } from '@/features/agents/Avatar'
import { fmtCost } from '@/pages/sessions/util'
import { useCompact } from '@/stores/media'
import { AddPositionDialog } from './dialogs'
import { OrgList } from './OrgList'
import { PositionSheet } from './PositionSheet'
import { ProjectChip, STATE_TONE, chartOrder, chartRoots, stateText, subtreeIds, useProjects, useSavePosition, type ProjectInfo } from './parts'

/** Minimum panel width in rem, per zoom step; the middle one is "fit to screen" (the panels share the width). */
const ZOOMS = [15, 19, 26, 34]
const FIT = 1
const ZOOM_KEY = 'ent-chart-zoom'

function readZoom(): number {
  try {
    const n = Number(localStorage.getItem(ZOOM_KEY))
    return Number.isInteger(n) && n >= 0 && n < ZOOMS.length ? n : FIT
  } catch {
    return FIT
  }
}

/** The face (or an empty seat). */
function Face({ p, size }: { p: Position; size: number }) {
  return p.occupant ? (
    <AgentAvatarIcon avatar={p.occupant.avatar} size={size} mood={p.occupant.enabled ? 'idle' : 'sleep'} />
  ) : (
    <span style={{ width: size, height: size }} className="flex shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground">
      <UserRound className="size-4" strokeWidth={1.6} />
    </span>
  )
}

type CardProps = {
  p: Position
  project: ProjectInfo | null
  /** who it reports to, when that is not obvious from the panel: a position's title, or null for you */
  lead?: { title: string | null }
  dim: boolean
  selected: boolean
  over: boolean
  compact: boolean
  onOpen: () => void
  onDown: (ev: React.PointerEvent) => void
}

/** One position: its full title (two lines), who holds it, its state and cost, and the project it works on. */
function PositionCard({ p, project, lead, dim, selected, over, compact, onOpen, onDown }: CardProps) {
  const t = useT()
  const st = STATE_TONE[p.state]
  return (
    <button
      type="button"
      data-pos={p.id}
      data-state={p.state}
      data-project={project?.name || ''}
      data-testid="position-card"
      onClick={onOpen}
      onPointerDown={onDown}
      aria-label={`${p.title} · ${stateText(t, p)}`}
      style={project ? { borderLeftColor: project.color } : undefined}
      className={cn(
        'grid w-full cursor-pointer gap-1.5 rounded-lg border border-l-4 bg-card text-left transition-colors outline-none select-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring',
        compact ? 'p-2' : 'p-3',
        !p.occupant && 'border-dashed bg-transparent',
        dim && 'opacity-40',
        (selected || over) && 'border-primary ring-2 ring-primary/40',
      )}
    >
      <span className="flex items-start gap-2.5">
        <Face p={p} size={compact ? 28 : 36} />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="line-clamp-2 text-sm leading-snug font-medium break-words" title={p.title}>
            <Sensitive length={10}>{p.title}</Sensitive>
          </span>
          <span className="truncate text-xs text-muted-foreground">{p.occupant ? <Sensitive length={8}>{p.occupant.display_name}</Sensitive> : t('ent.chart.vacant')}</span>
        </span>
      </span>
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        {project ? <ProjectChip project={project} className="flex-1 basis-24" /> : <span className="flex-1 text-xs text-muted-foreground">{p.occupant ? '' : t('ent.chart.noProject')}</span>}
        <span className="inline-flex shrink-0 items-center gap-2 text-xs text-muted-foreground tabular-nums">
          {p.inbox > 0 && <span title={t('ent.chart.inbox', { count: p.inbox })}>{t('ent.chart.inboxShort', { count: p.inbox })}</span>}
          <Sensitive length={4}>{fmtCost(p.cost_today)}</Sensitive>
          <span className="inline-flex items-center gap-1.5" title={stateText(t, p)}>
            <StatusDot tone={st.tone} pulse={st.pulse} />
            <span className="sr-only">{stateText(t, p)}</span>
          </span>
        </span>
      </span>
      {lead && !compact && (
        <span className="truncate text-[11px] text-muted-foreground">{lead.title ? t('ent.chart.reportsTo', { title: lead.title }) : t('ent.chart.reportsToYou')}</span>
      )}
    </button>
  )
}

/** The top of the chart: you (a drop target for "report to the top"), or the top position with you folded in. */
function TopCard({ top, over, cardProps }: { top: Position | undefined; over: string | null | undefined; cardProps: (p: Position) => CardProps }) {
  const t = useT()
  const youOver = over === null
  if (!top)
    return (
      <div data-pos="" data-testid="chart-owner" className={cn('flex items-center gap-2.5 rounded-xl border bg-muted/40 p-3 select-none', youOver && 'border-primary ring-2 ring-primary/40')}>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <UsersRound className="size-4" strokeWidth={1.6} />
        </span>
        <span className="grid min-w-0">
          <span className="truncate text-sm font-medium">{t('ent.chart.owner')}</span>
          <span className="truncate text-xs text-muted-foreground">{t('ent.chart.ownerHint')}</span>
        </span>
      </div>
    )
  return (
    <div data-pos="" data-testid="chart-owner" className={cn('grid max-w-md gap-2 rounded-xl border bg-muted/40 p-2 select-none', youOver && 'border-primary ring-2 ring-primary/40')}>
      <span className="flex items-center gap-2 px-1 text-xs font-medium text-muted-foreground">
        <UsersRound className="size-3.5" strokeWidth={1.6} />
        {t('ent.chart.ownerTop')}
      </span>
      <PositionCard {...cardProps(top)} />
    </div>
  )
}

type PanelItem = { p: Position; ind: number }

function DeptPanel({ id, name, items, cost, ceiling, warned, folded, onToggle, card }: { id: string; name: string; items: PanelItem[]; cost: number; ceiling: number | null; warned: boolean; folded: boolean; onToggle: () => void; card: (p: Position, ind: number) => React.ReactNode }) {
  const t = useT()
  const vacant = items.filter((x) => !x.p.agent).length
  return (
    <section className="grid content-start gap-2 rounded-xl border bg-card/40 p-2" aria-label={name} data-testid="chart-department" data-department={id}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!folded}
        aria-label={t(folded ? 'ent.chart.expand' : 'ent.chart.collapse', { title: name })}
        className="flex min-h-9 w-full items-center gap-2 rounded-md px-1.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none', folded && '-rotate-90')} />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          <Sensitive length={8}>{name}</Sensitive>
        </span>
        {warned && (
          <Tooltip content={t('ent.budget.warnShort')}>
            <TriangleAlert className="size-4 shrink-0 text-warning" aria-label={t('ent.budget.warnShort')} />
          </Tooltip>
        )}
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {t('ent.card.positions', { count: items.length })}
          {vacant > 0 && ` · ${t('ent.card.vacant', { count: vacant })}`}
        </span>
      </button>
      {!folded && (
        <>
          <p className="px-1.5 text-xs text-muted-foreground tabular-nums">
            {t('ent.chart.deptCost', { cost: fmtCost(cost) })}
            {ceiling != null && ` / ${fmtCost(ceiling)}`}
          </p>
          <ul className="grid gap-2">
            {items.map(({ p, ind }) => (
              <li key={p.id} style={{ marginLeft: ind * 14 }}>
                {card(p, ind)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export function OrgChart({ enterprise: e }: { enterprise: Enterprise }) {
  const t = useT()
  const touch = useCompact()
  const [params, setParams] = useSearchParams()
  const sel = params.get('pos')
  const view = params.get('view') === 'list' ? 'list' : 'chart'
  const filter = params.get('project') || ''
  const [adding, setAdding] = React.useState(false)
  const [closed, setClosed] = React.useState<Set<string>>(new Set())
  const [zoom, setZoomState] = React.useState(readZoom)
  const [drag, setDrag] = React.useState<{ id: string; x: number; y: number; over: string | null | undefined } | null>(null)
  const { save } = useSavePosition(e)
  const projects = useProjects(e)
  const { kids } = React.useMemo(() => chartRoots(e), [e])
  const order = React.useMemo(() => chartOrder(e), [e])
  const byId = React.useMemo(() => new Map(e.positions.map((p) => [p.id, p])), [e.positions])
  const top = e.top !== 'owner' ? byId.get(e.top) : undefined

  const setZoom = (n: number) => {
    const z = Math.min(ZOOMS.length - 1, Math.max(0, n))
    setZoomState(z)
    try {
      localStorage.setItem(ZOOM_KEY, String(z))
    } catch {
      /* the zoom is a convenience only */
    }
  }
  const setParam = React.useCallback(
    (k: string, v: string | null) =>
      setParams(
        (p) => {
          if (v) p.set(k, v)
          else p.delete(k)
          return p
        },
        { replace: true },
      ),
    [setParams],
  )
  const open = React.useCallback((id: string | null) => setParam('pos', id), [setParam])

  // who each position reports to as drawn (a root under a top position reports to it), and its project
  const leadOf = React.useMemo(() => {
    const m = new Map<string, string | null>()
    for (const [lead, list] of kids) for (const c of list) m.set(c.id, lead)
    return m
  }, [kids])
  const counts = React.useMemo(() => {
    const n = new Map<string, number>()
    for (const p of e.positions) {
      const pr = projects.of(p)
      if (pr) n.set(pr.name, (n.get(pr.name) || 0) + 1)
    }
    return n
  }, [e.positions, projects])
  const matches = (p: Position) => !filter || projects.of(p)?.name === filter

  // Drag: a computer's pointer only. Where it lands: a card (its id), the top card (''), or nowhere.
  const eRef = React.useRef(e)
  eRef.current = e
  const suppress = React.useRef(false)
  const target = (x: number, y: number, p: Position): string | null | undefined => {
    const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-pos]')
    if (!el) return undefined
    const id = el.dataset.pos ?? ''
    if (id === p.id || subtreeIds(eRef.current.positions, p.id).has(id)) return undefined
    return id === '' ? (p.reports_to === null ? undefined : null) : id === p.reports_to ? undefined : id
  }
  const down = (p: Position, ev: React.PointerEvent) => {
    if (touch || ev.pointerType !== 'mouse' || ev.button !== 0) return
    const sx = ev.clientX
    const sy = ev.clientY
    let moved = false
    const move = (m: PointerEvent) => {
      if (!moved && Math.hypot(m.clientX - sx, m.clientY - sy) < 6) return
      moved = true
      setDrag({ id: p.id, x: m.clientX, y: m.clientY, over: target(m.clientX, m.clientY, p) })
    }
    const up = (m: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      if (!moved) return
      // the click that ends the drag must not open the panel
      suppress.current = true
      setTimeout(() => (suppress.current = false), 0)
      setDrag(null)
      const to = m.type === 'pointerup' ? target(m.clientX, m.clientY, p) : undefined
      if (to !== undefined) save(p.id, { reports_to: to }, { structural: true })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
  }
  const dragged = drag ? byId.get(drag.id) : undefined
  const over = drag ? drag.over : undefined
  const compact = zoom === 0
  const cardProps = (p: Position): CardProps => {
    const lead = leadOf.get(p.id)
    const leadPos = lead ? byId.get(lead) : undefined
    return {
      p,
      project: projects.of(p),
      lead: !lead ? { title: null } : leadPos && leadPos.department !== p.department ? { title: leadPos.title } : undefined,
      dim: !matches(p),
      selected: sel === p.id,
      over: over === p.id,
      compact,
      onOpen: () => {
        if (!suppress.current) open(p.id)
      },
      onDown: (ev) => down(p, ev),
    }
  }

  // department panels in order of first appearance, each holding its positions in reading order
  const panels = React.useMemo(() => {
    const m = new Map<string, PanelItem[]>()
    const ind = new Map<string, number>()
    for (const { p } of order) {
      if (p === top) continue
      const up = leadOf.get(p.id)
      const lead = up ? byId.get(up) : undefined
      const n = lead && lead !== top && lead.department === p.department ? Math.min(3, (ind.get(lead.id) || 0) + 1) : 0
      ind.set(p.id, n)
      m.set(p.department, [...(m.get(p.department) || []), { p, ind: n }])
    }
    return [...m.entries()]
  }, [order, top, leadOf, byId])
  const warned = new Set((e.budget_warnings || []).map((w) => w.department))
  const toggle = (id: string) => setClosed((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)))

  return (
    <div className="grid gap-4" data-testid="org-chart">
      {e.broken && (
        <Callout tone="warning" title={t('ent.chart.broken')}>
          {typeof e.broken === 'string' ? e.broken : t('ent.chart.brokenDesc')}
        </Callout>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented
          size="sm"
          aria-label={t('ent.chart.view')}
          value={view}
          onChange={(v) => setParam('view', v === 'list' ? 'list' : null)}
          options={[
            { value: 'chart', label: t('ent.chart.viewChart'), icon: <LayoutGrid /> },
            { value: 'list', label: t('ent.chart.viewList'), icon: <List /> },
          ]}
        />
        <div className="flex flex-wrap items-center gap-2">
          {view === 'chart' && !touch && (
            <div className="flex items-center gap-1" role="group" aria-label={t('ent.chart.zoom')}>
              <Button size="icon-sm" variant="outline" aria-label={t('ent.chart.zoomOut')} onClick={() => setZoom(zoom - 1)} disabled={zoom === 0} data-testid="chart-zoom-out">
                <ZoomOut />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setZoom(FIT)} disabled={zoom === FIT} data-testid="chart-zoom-fit">
                {t('ent.chart.fit')}
              </Button>
              <Button size="icon-sm" variant="outline" aria-label={t('ent.chart.zoomIn')} onClick={() => setZoom(zoom + 1)} disabled={zoom === ZOOMS.length - 1} data-testid="chart-zoom-in">
                <ZoomIn />
              </Button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} data-testid="position-add">
            <Plus /> {t('ent.position.add')}
          </Button>
        </div>
      </div>
      {projects.list.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('ent.chart.projectFilter')} data-testid="project-filter">
          <Button size="sm" variant={filter ? 'outline' : 'secondary'} aria-pressed={!filter} onClick={() => setParam('project', null)}>
            {t('ent.chart.allProjects')}
          </Button>
          {projects.list.map((pr) => (
            <Button key={pr.name} size="sm" variant={filter === pr.name ? 'secondary' : 'outline'} aria-pressed={filter === pr.name} onClick={() => setParam('project', filter === pr.name ? null : pr.name)} data-project={pr.name}>
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: pr.color }} />
              {pr.emoji && <span aria-hidden>{pr.emoji}</span>}
              <Sensitive length={8}>{pr.name}</Sensitive>
              <span className="text-muted-foreground tabular-nums">{counts.get(pr.name) || 0}</span>
            </Button>
          ))}
        </div>
      )}
      {e.positions.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={t('ent.chart.empty')}
          description={t('ent.chart.emptyDesc')}
          action={
            <Button onClick={() => setAdding(true)}>
              <Plus /> {t('ent.position.add')}
            </Button>
          }
        />
      ) : view === 'list' ? (
        <OrgList enterprise={e} order={order} projects={projects} filter={filter} selected={sel} onOpen={open} />
      ) : (
        <div className="grid gap-4">
          <p className="text-[13px] text-muted-foreground">{touch ? t('ent.chart.hintTouch') : t('ent.chart.hint')}</p>
          <TopCard top={top} over={over} cardProps={cardProps} />
          <div className="grid items-start gap-3" style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${ZOOMS[zoom]}rem), 1fr))` }} data-testid="chart-panels">
            {panels.map(([d, items]) => (
              <DeptPanel
                key={d}
                id={d}
                name={d ? e.departments[d]?.name || d : t('ent.overview.noDepartment')}
                items={items}
                cost={items.reduce((n, x) => n + x.p.cost_today, 0)}
                ceiling={e.departments[d]?.envelope?.usd_per_day ?? null}
                warned={warned.has(d)}
                folded={closed.has(d)}
                onToggle={() => toggle(d)}
                card={(p) => <PositionCard {...cardProps(p)} />}
              />
            ))}
          </div>
        </div>
      )}
      {drag && dragged && (
        <div
          className="pointer-events-none fixed z-[60] flex w-48 items-center gap-2 rounded-xl border border-primary bg-popover p-2 text-sm shadow-pop"
          style={{ left: drag.x + 12, top: drag.y + 12 }}
          aria-hidden
        >
          <Face p={dragged} size={24} />
          <span className="truncate"><Sensitive length={10}>{dragged.title}</Sensitive></span>
        </div>
      )}
      <AddPositionDialog enterprise={e} open={adding} onOpenChange={setAdding} />
      <PositionSheet enterprise={e} positionId={sel} onClose={() => open(null)} />
    </div>
  )
}
