// "Right now" strip under the header: who works on what and since when, who waits, with a link to the agent.
import { Link } from 'react-router'
import { useLang, useT } from '@/i18n'
import { agentRoute, useEnterpriseNow } from '@/lib/queries'
import { fmtRelative } from '@/lib/format'
import type { Enterprise } from '@/lib/types'
import { Sensitive, StatusDot } from '@/components/ui'
import { STATE_TONE } from './parts'
import { agentOf } from './PositionSheet'

export function NowStrip({ enterprise: e }: { enterprise: Enterprise }) {
  const t = useT()
  const lang = useLang()
  const { data } = useEnterpriseNow(e.id)
  const title = (id: string) => e.positions.find((p) => p.id === id)?.title || id
  return (
    <section className="rounded-xl border bg-card px-4 py-3" aria-label={t('ent.now.title')} data-testid="enterprise-now">
      <h2 className="mb-2 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{t('ent.now.title')}</h2>
      {!data || data.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">{t('ent.now.nobody')}</p>
      ) : (
        <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((x) => {
            const tone = STATE_TONE[(x.state === 'queued' ? 'waiting' : x.state) as keyof typeof STATE_TONE] || STATE_TONE.idle
            const task = x.task?.title || ''
            const body = (
              <>
                <StatusDot tone={tone.tone} pulse={tone.pulse} label={t(tone.label)} className="mt-1.5 size-2 shrink-0" />
                <span className="grid min-w-0">
                  <span className="truncate font-medium">
                    <Sensitive length={8}>{title(x.position)}</Sensitive>
                  </span>
                  <span className="line-clamp-2 text-muted-foreground">{task ? <Sensitive length={20}>{task}</Sensitive> : t(tone.label)}</span>
                  <span className="text-xs text-muted-foreground">{fmtRelative(x.since, lang)}</span>
                </span>
              </>
            )
            return (
              <li key={x.position} data-testid="now-row">
                {x.agent ? (
                  <Link to={agentRoute(agentOf(x.agent))} className="flex gap-2 rounded-md px-1.5 py-1 text-[13px] hover:bg-accent">
                    {body}
                  </Link>
                ) : (
                  <div className="flex gap-2 px-1.5 py-1 text-[13px]">{body}</div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
