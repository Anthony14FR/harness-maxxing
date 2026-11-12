// Tab "Tasks": the delegated tasks of the enterprise grouped by state, filtered by owner or requester, with the link to the run.
import * as React from 'react'
import { Link } from 'react-router'
import { ListChecks, Play } from 'lucide-react'
import { useLang, useT } from '@/i18n'
import { errorMessage } from '@/lib/api'
import { useEnterpriseTasks } from '@/lib/queries'
import { fmtRelative } from '@/lib/format'
import type { Enterprise, EnterpriseTask } from '@/lib/types'
import { Badge, Button, EmptyState, Select, Sensitive, Skeleton, StatusDot } from '@/components/ui'
import { TASK_GROUPS, taskGroup } from './taskState'

const ALL = '__all'

export function Tasks({ enterprise: e }: { enterprise: Enterprise }) {
  const t = useT()
  const lang = useLang()
  const { data, isLoading, error, refetch } = useEnterpriseTasks(e.id)
  const [who, setWho] = React.useState(ALL)
  const title = (id: string) => (id === 'owner' ? t('ent.decisions.owner') : e.positions.find((p) => p.id === id)?.title || id)
  const people = [{ value: ALL, label: t('ent.tasks.everyone') }, ...e.positions.map((p) => ({ value: p.id, label: p.title }))]
  if (isLoading) return <Skeleton className="h-80 rounded-xl" />
  if (error || !data)
    return (
      <EmptyState
        tone="error"
        icon={ListChecks}
        title={t('ent.tasks.loadError')}
        description={errorMessage(error)}
        action={
          <Button variant="outline" onClick={() => void refetch()}>
            {t('common.retry')}
          </Button>
        }
      />
    )
  const items = data.filter((x) => who === ALL || x.owner === who || x.requester === who)
  return (
    <div className="grid gap-5" data-testid="enterprise-tasks">
      <div className="lg:max-w-xs">
        <Select value={who} onValueChange={setWho} options={people} aria-label={t('ent.tasks.filter')} />
      </div>
      {items.length === 0 ? (
        <EmptyState icon={ListChecks} title={t('ent.tasks.empty')} description={t('ent.tasks.emptyDesc')} compact />
      ) : (
        TASK_GROUPS.map((g) => {
          const rows = items.filter((x) => taskGroup(x) === g.id)
          if (rows.length === 0) return null
          return (
            <section key={g.id} className="grid gap-2" data-testid={`tasks-${g.id}`}>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-medium">{t(g.label)}</h3>
                <Badge variant="muted">{rows.length}</Badge>
              </div>
              <div className="overflow-x-auto rounded-xl border bg-card">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="border-b text-xs text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-medium">{t('ent.tasks.col.title')}</th>
                      <th className="px-3 py-2 font-medium">{t('ent.tasks.col.owner')}</th>
                      <th className="px-3 py-2 font-medium">{t('ent.tasks.col.requester')}</th>
                      <th className="px-3 py-2 font-medium">{t('ent.tasks.col.age')}</th>
                      <th className="px-3 py-2 font-medium">{t('ent.tasks.col.lastMove')}</th>
                      <th className="px-3 py-2 text-right font-medium">{t('ent.tasks.col.hops')}</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((x) => (
                      <Row key={x.id} x={x} title={title} lang={lang} />
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}

function Row({ x, title, lang }: { x: EnterpriseTask; title: (id: string) => string; lang: string }) {
  const t = useT()
  const stage = x.stage === 'review_pending' ? 'ent.stage.review_pending' : x.stage === 'changes' ? 'ent.stage.changes' : null
  return (
    <tr data-testid="task-row">
      <td className="max-w-[22rem] px-4 py-2.5">
        <span className="line-clamp-2">
          <Sensitive length={20}>{x.title}</Sensitive>
        </span>
        <span className="mt-1 flex flex-wrap gap-1">
          {stage && <Badge variant="warning">{t(stage)}</Badge>}
          {x.outside && <Badge variant="warning">{t('ent.tasks.outside')}</Badge>}
        </span>
      </td>
      <td className="px-3 py-2.5">
        <Sensitive length={8}>{title(x.owner)}</Sensitive>
      </td>
      <td className="px-3 py-2.5">
        <Sensitive length={8}>{title(x.requester)}</Sensitive>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">{fmtRelative(x.created, lang)}</td>
      <td className="max-w-[16rem] px-3 py-2.5 text-muted-foreground">
        <span className="line-clamp-2">{x.last_move}</span>
        <span className="text-xs">{fmtRelative(x.updated, lang)}</span>
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums">{x.hops}</td>
      <td className="px-4 py-2.5 text-right">
        {x.run && (
          <Button asChild variant="ghost" size="sm">
            <Link to={`/sessions?session=${encodeURIComponent(x.run.session)}`}>
              {x.run.running ? <StatusDot tone="running" pulse className="size-1.5" /> : <Play />} {t('ent.tasks.run')}
            </Link>
          </Button>
        )}
      </td>
    </tr>
  )
}
