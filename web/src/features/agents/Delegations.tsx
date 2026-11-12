// Side panel card of a seated agent: the tasks it delegated, with their live state (the enterprise bus topic refreshes them).
import { Link } from 'react-router'
import { useQueries } from '@tanstack/react-query'
import { useLang, useT, type TKey } from '@/i18n'
import { enterpriseQuery, useEnterpriseTasks, useEnterprises, useSettings } from '@/lib/queries'
import { fmtRelative } from '@/lib/format'
import type { EnterpriseTask } from '@/lib/types'
import { Badge, Sensitive, StatusDot } from '@/components/ui'

const STATE: Record<string, { label: TKey; variant: 'muted' | 'default' | 'warning' | 'success' }> = {
  todo: { label: 'agents.deleg.todo', variant: 'muted' },
  doing: { label: 'agents.deleg.doing', variant: 'default' },
  assigned: { label: 'agents.deleg.assigned', variant: 'muted' },
  handed: { label: 'agents.deleg.handed', variant: 'warning' },
  review: { label: 'agents.deleg.review', variant: 'warning' },
  blocked: { label: 'agents.deleg.blocked', variant: 'warning' },
  done: { label: 'agents.deleg.done', variant: 'success' },
}

/** todo = waiting in the inbox, assigned = given, doing = a run is on it, handed = handed in, review = in review, done = accepted */
function stateOf(x: EnterpriseTask): string {
  if (x.status === 'done') return 'done'
  if (x.stage === 'blocked') return 'blocked'
  if (x.stage === 'review' || x.stage === 'reviewed') return 'handed'
  if (x.stage === 'review_pending' || x.stage === 'changes') return 'review'
  if (x.run?.running) return 'doing'
  return x.status === 'doing' || x.status === 'in_progress' ? 'assigned' : 'todo'
}

/** The enterprise and position an agent sits in, if any (nothing while the feature is off). */
function useSeat(path: string) {
  const { data: s } = useSettings()
  const on = !!s?.enterprises_page && !!s?.agents_page
  const { data: list } = useEnterprises(on)
  const all = useQueries({ queries: on ? (list || []).map((x) => enterpriseQuery(x.id)) : [], combine: (rs) => rs.map((r) => r.data) })
  for (const e of all) {
    const p = e?.positions.find((q) => q.agent === path)
    if (e && p) return { enterprise: e.id, position: p.id, title: (id: string) => e.positions.find((q) => q.id === id)?.title || id }
  }
  return null
}

export function useIsSeated(path: string): boolean {
  return !!useSeat(path)
}

export function Delegations({ path }: { path: string }) {
  const t = useT()
  const lang = useLang()
  const seat = useSeat(path)
  const { data } = useEnterpriseTasks(seat?.enterprise ?? null)
  if (!seat) return null
  const mine = (data || []).filter((x) => x.requester === seat.position)
  return (
    <ul className="grid gap-1.5" data-testid="agent-delegations">
      {mine.length === 0 ? (
        <li className="text-xs text-muted-foreground">{t('agents.deleg.empty')}</li>
      ) : (
        mine.map((x) => {
          const st = STATE[stateOf(x)]
          return (
            <li key={x.id} className="grid gap-1 rounded-lg border px-3 py-2 text-[13px]">
              <span className="line-clamp-2">
                <Sensitive length={20}>{x.title}</Sensitive>
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <Badge variant={st.variant}>
                  {x.run?.running && <StatusDot tone="running" pulse className="size-1.5" />} {t(st.label)}
                </Badge>
                <Link to={`/enterprises/${seat.enterprise}/tasks`} className="hover:text-foreground hover:underline">
                  <Sensitive length={8}>{seat.title(x.owner)}</Sensitive>
                </Link>
                <span>{fmtRelative(x.updated, lang)}</span>
              </span>
            </li>
          )
        })
      )}
    </ul>
  )
}
