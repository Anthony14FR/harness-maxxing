// The org chart as a table (the "List" view): one row per position in reading order, with who holds it, its department and
// project, its state and its cost of the day; the project filter of the chart applies. A click opens the position's panel.
import { useT } from '@/i18n'
import type { Enterprise, Position } from '@/lib/types'
import { cn } from '@/lib/utils'
import { EmptyState, Sensitive, StatusDot } from '@/components/ui'
import { AgentAvatarIcon } from '@/features/agents/Avatar'
import { fmtCost } from '@/pages/sessions/util'
import { ProjectChip, STATE_TONE, stateText, type ProjectInfo } from './parts'

export function OrgList({
  enterprise: e,
  order,
  projects,
  filter,
  selected,
  onOpen,
}: {
  enterprise: Enterprise
  order: { p: Position; depth: number }[]
  projects: { of: (p: Position) => ProjectInfo | null }
  filter: string
  selected: string | null
  onOpen: (id: string) => void
}) {
  const t = useT()
  const rows = order.filter(({ p }) => !filter || projects.of(p)?.name === filter)
  if (rows.length === 0) return <EmptyState title={t('ent.list.none')} description={t('ent.list.noneDesc')} />
  const total = rows.reduce((n, { p }) => n + p.cost_today, 0)
  const dept = (p: Position) => (p.department ? e.departments[p.department]?.name || p.department : t('ent.overview.noDepartment'))
  return (
    <div className="overflow-hidden rounded-xl border" data-testid="org-list">
      <table className="w-full table-fixed border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
            <th scope="col" className="px-3 py-2 md:w-[28%]">{t('ent.list.position')}</th>
            <th scope="col" className="hidden px-3 py-2 md:table-cell md:w-[20%]">{t('ent.list.agent')}</th>
            <th scope="col" className="hidden px-3 py-2 md:table-cell md:w-[26%]">{t('ent.list.where')}</th>
            <th scope="col" className="w-28 px-3 py-2 md:w-[16%]">{t('ent.list.state')}</th>
            <th scope="col" className="w-16 px-3 py-2 text-right md:w-[10%]">{t('ent.list.cost')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ p, depth }) => {
            const st = STATE_TONE[p.state]
            const project = projects.of(p)
            const who = p.occupant ? <Sensitive length={8}>{p.occupant.display_name}</Sensitive> : t('ent.chart.vacant')
            return (
              <tr
                key={p.id}
                data-pos={p.id}
                data-testid="position-row"
                data-project={project?.name || ''}
                tabIndex={0}
                onClick={() => onOpen(p.id)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    onOpen(p.id)
                  }
                }}
                className={cn('cursor-pointer border-b align-top outline-none last:border-b-0 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset', selected === p.id && 'bg-accent')}
              >
                <td className="px-3 py-2">
                  <span className="flex items-start gap-2.5" style={{ paddingLeft: Math.min(depth, 4) * 12 }}>
                    {p.occupant ? <AgentAvatarIcon avatar={p.occupant.avatar} size={28} mood={p.occupant.enabled ? 'idle' : 'sleep'} /> : <span className="size-7 shrink-0 rounded-md border border-dashed" />}
                    <span className="grid min-w-0 gap-0.5">
                      <span className="font-medium break-words">
                        <Sensitive length={10}>{p.title}</Sensitive>
                      </span>
                      <span className="grid gap-0.5 text-xs text-muted-foreground md:hidden">
                        <span className="truncate">{who}</span>
                        {project && <ProjectChip project={project} />}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  <span className="block truncate">{who}</span>
                </td>
                <td className="hidden px-3 py-2 md:table-cell">
                  <span className="grid gap-0.5">
                    <span className="truncate text-xs text-muted-foreground">
                      <Sensitive length={8}>{dept(p)}</Sensitive>
                    </span>
                    {project ? <ProjectChip project={project} /> : <span className="text-xs text-muted-foreground">{t('ent.chart.noProject')}</span>}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-start gap-1.5 text-xs">
                    <span className="mt-1">
                      <StatusDot tone={st.tone} pulse={st.pulse} />
                    </span>
                    <span>{stateText(t, p)}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-xs tabular-nums">
                  <Sensitive length={4}>{fmtCost(p.cost_today)}</Sensitive>
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/40 text-xs text-muted-foreground">
            <td className="px-3 py-2" colSpan={4}>
              {t('ent.list.total', { count: rows.length })}
            </td>
            <td className="px-3 py-2 text-right tabular-nums">
              <Sensitive length={4}>{fmtCost(total)}</Sensitive>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
