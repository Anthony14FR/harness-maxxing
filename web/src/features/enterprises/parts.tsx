// Building blocks shared by the Enterprises pages: the state of a position, the tree of the chart, the "off" page.
import * as React from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Building2, Settings2 } from 'lucide-react'
import { useT, type TKey } from '@/i18n'
import { errorMessage, isApiError } from '@/lib/api'
import { entKeys, useResumePosition, usePatchPosition, useSettings, useWorkspace } from '@/lib/queries'
import type { Enterprise, Position, PositionPatch, PositionState } from '@/lib/types'
import { Button, EmptyState, confirm, toast, type DotTone } from '@/components/ui'
import { Page } from '@/components/shell/Page'
import { OUTFIT } from '@/features/agents/Avatar'
import { useProjectColorOf } from '@/features/agents/layout'
import { cn } from '@/lib/utils'

/** Settings -> Features: Enterprises is on and Agents too (undefined while the settings load). */
export function useEnterprisesOn(): boolean | undefined {
  const { data: s } = useSettings()
  return s ? !!s.enterprises_page && !!s.agents_page : undefined
}

/** The page shown when the feature is off. */
export function EnterprisesOff() {
  const t = useT()
  return (
    <Page title={t('ent.title')} description={t('ent.desc')}>
      <EmptyState
        icon={Building2}
        title={t('ent.off')}
        description={t('ent.offDesc')}
        action={
          <Button asChild>
            <Link to="/settings/features">
              <Settings2 /> {t('ent.turnOn')}
            </Link>
          </Button>
        }
      />
    </Page>
  )
}

/** The Office's tones for the states they share (waiting, working, unread, failed, off); the rest is calm. */
export const STATE_TONE: Record<PositionState, { tone: DotTone; pulse?: boolean; label: TKey }> = {
  working: { tone: 'running', pulse: true, label: 'ent.state.working' },
  waiting: { tone: 'warn', pulse: true, label: 'ent.state.waiting' },
  unread: { tone: 'unread', label: 'ent.state.unread' },
  failed: { tone: 'error', label: 'ent.state.failed' },
  off: { tone: 'idle', label: 'ent.state.off' },
  vacant: { tone: 'idle', label: 'ent.state.vacant' },
  blocked: { tone: 'warn', label: 'ent.state.blocked' },
  idle: { tone: 'ok', label: 'ent.state.idle' },
}

const BLOCKED_REASONS: Record<string, TKey> = {
  budget: 'ent.blocked.budget',
  envelope: 'ent.blocked.envelope',
  disabled: 'ent.blocked.disabled',
  'agent missing': 'ent.blocked.agentMissing',
  untrusted_unfit: 'ent.blocked.untrustedUnfit',
}

/** What a position's state reads: a blocked one says why (known reasons translated, anything else as sent). */
export function stateText(t: (k: TKey) => string, p: Position): string {
  if (p.state !== 'blocked' || !p.blocked_reason) return t(STATE_TONE[p.state].label)
  const k = BLOCKED_REASONS[p.blocked_reason]
  return `${t('ent.state.blocked')}: ${k ? t(k) : p.blocked_reason}`
}

/** position id -> the positions that report to it, in chart order. A lead that is not in the chart (broken file)
 *  counts as no lead, so no box is ever lost. */
export function childrenMap(positions: Position[]): Map<string | null, Position[]> {
  const ids = new Set(positions.map((p) => p.id))
  const out = new Map<string | null, Position[]>()
  for (const p of positions) {
    const lead = p.reports_to && ids.has(p.reports_to) && p.reports_to !== p.id ? p.reports_to : null
    out.set(lead, [...(out.get(lead) || []), p])
  }
  return out
}

/** The position and everything below it. */
export function subtreeIds(positions: Position[], id: string): Set<string> {
  const kids = childrenMap(positions)
  const out = new Set<string>([id])
  const walk = (x: string) => {
    for (const c of kids.get(x) || []) if (!out.has(c.id)) {
      out.add(c.id)
      walk(c.id)
    }
  }
  walk(id)
  return out
}

/** The roots of the chart as drawn: under the top. A position as top (Director) leads the other roots. */
export function chartRoots(e: Pick<Enterprise, 'positions' | 'top'>): { kids: Map<string | null, Position[]>; roots: Position[] } {
  const kids = childrenMap(e.positions)
  const roots = kids.get(null) || []
  const top = e.top !== 'owner' ? roots.find((p) => p.id === e.top) : undefined
  if (!top) return { kids, roots }
  kids.set(top.id, [...(kids.get(top.id) || []), ...roots.filter((p) => p !== top)])
  return { kids, roots: [top] }
}

/** Where the agents of a position may come from: its linked projects' agents, as paths. */
export const inProjects = (path: string, projects: string[]) => projects.some((p) => path.startsWith(`projects/${p}/`))

/** Why an occupant does not fit a position that runs code from outside, in words (the server's reasons, as sent when unknown). */
export function unfitReasons(t: (k: TKey) => string, reasons: unknown): string[] {
  const known: Record<string, TKey> = { sandbox: 'ent.untrusted.reason.sandbox', not_sandboxed: 'ent.untrusted.reason.sandbox', unprotected: 'ent.untrusted.reason.sandbox', keys: 'ent.untrusted.reason.keys', has_keys: 'ent.untrusted.reason.keys', holds_keys: 'ent.untrusted.reason.keys', no_sandbox: 'ent.untrusted.reason.unavailable', sandbox_unavailable: 'ent.untrusted.reason.unavailable' }
  return (Array.isArray(reasons) ? reasons : []).map((r) => (typeof r === 'string' && known[r] ? t(known[r]) : String(r)))
}

/** Saves one position. `structural` (move, re-seat) sends the chart's `rev`: when another change got there first the
 *  server answers `409 stale`, the chart is fetched again and the owner is told. Seating an agent of a project that is
 *  not linked (`409 project_not_linked`) asks first, then links the project and seats. */
export function useSavePosition(e: Pick<Enterprise, 'id' | 'rev'>) {
  const t = useT()
  const qc = useQueryClient()
  const patch = usePatchPosition()
  const save = (pos: string, fields: Omit<PositionPatch, 'rev'>, opts: { structural?: boolean; onDone?: () => void } = {}) =>
    patch.mutate(
      { id: e.id, pos, ...(opts.structural ? { rev: e.rev } : {}), ...fields },
      {
        onSuccess: () => opts.onDone?.(),
        onError: (err) => {
          if (isApiError(err, 'stale')) {
            void qc.invalidateQueries({ queryKey: entKeys.one(e.id) })
            toast.error(t('ent.stale'))
          } else if (isApiError(err, 'project_not_linked')) {
            const project = String(err.data.project || '')
            void confirm({ title: t('ent.seat.linkTitle', { project }), description: t('ent.seat.linkDesc', { project }), confirmText: t('ent.seat.linkAction') }).then((ok) => {
              if (ok) save(pos, { ...fields, link_project: true }, opts)
            })
          } else if (isApiError(err, 'untrusted_unfit')) {
            toast.error(`${t('ent.untrusted.unfit')} ${unfitReasons(t, err.data.reasons).join(' ')}`.trim())
          } else toast.error(errorMessage(err))
        },
      },
    )
  return { save, pending: patch.isPending }
}

/** A project as the Office shows it: its emoji and its colour (the one picked on the Agents page). */
export type ProjectInfo = { name: string; emoji: string; color: string }

/** The project of a position = the project of its occupant's agent (`projects/<p>/topics/...`); vacant = none. */
export const projectNameOf = (p: Pick<Position, 'agent'>): string => /^projects\/([^/]+)\//.exec(p.agent || '')?.[1] || ''

/** The linked projects of an enterprise with their Office emoji and colour, and the project of a position. */
export function useProjects(e: Pick<Enterprise, 'projects'>) {
  const { data: ws } = useWorkspace()
  const colorOf = useProjectColorOf()
  return React.useMemo(() => {
    const info = (name: string): ProjectInfo => ({ name, emoji: ws?.projects.find((x) => x.name === name)?.emoji || '', color: OUTFIT[colorOf(name)] })
    const list = e.projects.map(info)
    return { list, of: (p: Pick<Position, 'agent'>): ProjectInfo | null => (projectNameOf(p) ? info(projectNameOf(p)) : null) }
  }, [e.projects, ws, colorOf])
}

/** The project's colour dot, emoji and name in one small label. */
export function ProjectChip({ project, className }: { project: ProjectInfo; className?: string }) {
  return (
    <span className={cn('inline-flex max-w-full min-w-0 items-center gap-1.5 text-xs text-muted-foreground', className)} data-testid="project-chip" data-project={project.name}>
      <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: project.color }} />
      {project.emoji && <span aria-hidden>{project.emoji}</span>}
      <span className="min-w-0 truncate">{project.name}</span>
    </span>
  )
}

/** The chart in reading order (a lead, then its team, depth first), each with how many levels it sits below the top. */
export function chartOrder(e: Pick<Enterprise, 'positions' | 'top'>): { p: Position; depth: number }[] {
  const { kids, roots } = chartRoots(e)
  const out: { p: Position; depth: number }[] = []
  const seen = new Set<string>()
  const walk = (p: Position, depth: number) => {
    if (seen.has(p.id)) return
    seen.add(p.id)
    out.push({ p, depth })
    for (const c of kids.get(p.id) || []) walk(c, depth + 1)
  }
  for (const r of roots) walk(r, 0)
  for (const p of e.positions) walk(p, 0)
  return out
}

/** "Resume" for a position whose last run failed or that is blocked (nothing for the others). */
export function ResumeButton({ enterprise, position: p, className }: { enterprise: string; position: Position; className?: string }) {
  const t = useT()
  const resume = useResumePosition()
  if (p.state !== 'failed' && p.state !== 'blocked') return null
  return (
    <Button
      size="sm"
      variant="outline"
      className={className}
      loading={resume.isPending}
      onClick={() => resume.mutate({ id: enterprise, pos: p.id }, { onSuccess: () => toast.success(t('ent.resume.done')) })}
      data-testid="position-resume"
    >
      {t('ent.resume')}
    </Button>
  )
}
