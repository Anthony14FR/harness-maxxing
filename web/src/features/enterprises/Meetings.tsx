// The meetings of an enterprise (a card of the Overview): who called it and on what, who answered, the minutes when it ends.
import * as React from 'react'
import { useLang, useT } from '@/i18n'
import { useEnterpriseMeetings } from '@/lib/queries'
import { fmtRelative } from '@/lib/format'
import type { Enterprise, EnterpriseMeeting } from '@/lib/types'
import { Badge, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Sensitive } from '@/components/ui'
import { SettingsCard } from '@/pages/settings/sections/ui'

const titleOf = (e: Enterprise, id: string) => (id === 'owner' ? '' : e.positions.find((p) => p.id === id)?.title || id)

export function Meetings({ enterprise: e }: { enterprise: Enterprise }) {
  const t = useT()
  const lang = useLang()
  const { data, error } = useEnterpriseMeetings(e.id)
  const [openId, setOpenId] = React.useState<string | null>(null)
  if (error || !data) return null
  const who = (id: string) => titleOf(e, id) || t('ent.chart.owner')
  const current = data.find((m) => m.id === openId)
  const open = data.filter((m) => m.status === 'open').length
  return (
    <SettingsCard title={t('ent.meetings.title')} description={t('ent.meetings.desc')} actions={open > 0 ? <Badge variant="warning">{t('ent.meetings.open', { count: open })}</Badge> : undefined}>
      {data.length === 0 ? (
        <p className="text-[13px] text-muted-foreground" data-testid="meetings-empty">
          {t('ent.meetings.none')}
        </p>
      ) : (
        <ul className="divide-y rounded-lg border" data-testid="meetings-list">
          {data.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => setOpenId(m.id)} className="grid w-full gap-1 px-3 py-2.5 text-left outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset" data-testid="meeting-row">
                <span className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    <Sensitive length={24}>{m.topic}</Sensitive>
                  </span>
                  <Badge variant={m.status === 'open' ? 'warning' : 'muted'}>{t(m.status === 'open' ? 'ent.meetings.statusOpen' : 'ent.meetings.statusClosed')}</Badge>
                </span>
                <span className="text-xs text-muted-foreground">
                  <Sensitive length={8}>{who(m.organizer)}</Sensitive> · {t('ent.meetings.replied', { done: m.replies.length, total: m.participants.length })} · {fmtRelative(m.at, lang)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <MeetingDetail enterprise={e} meeting={current} onClose={() => setOpenId(null)} />
    </SettingsCard>
  )
}

function MeetingDetail({ enterprise: e, meeting: m, onClose }: { enterprise: Enterprise; meeting: EnterpriseMeeting | undefined; onClose: () => void }) {
  const t = useT()
  const lang = useLang()
  return (
    <Dialog open={!!m} onOpenChange={(v) => !v && onClose()}>
      <DialogContent data-testid="meeting-detail">
        {m && (
          <div className="grid gap-4">
            <DialogHeader>
              <DialogTitle>
                <Sensitive length={24}>{m.topic}</Sensitive>
              </DialogTitle>
              <DialogDescription>
                {t('ent.meetings.calledBy', { name: titleOf(e, m.organizer) || t('ent.chart.owner') })} · {fmtRelative(m.at, lang)}
                {m.status === 'open' && m.deadline ? ` · ${t('ent.meetings.until', { when: fmtRelative(m.deadline, lang) })}` : ''}
              </DialogDescription>
            </DialogHeader>
            <ul className="grid gap-2">
              {m.participants.map((id) => {
                const r = m.replies.find((x) => x.position === id)
                return (
                  <li key={id} className="grid gap-1 rounded-lg border p-3 text-[13px]">
                    <span className="flex items-center justify-between gap-2 text-xs font-medium">
                      <Sensitive length={8}>{titleOf(e, id) || id}</Sensitive>
                      {!r && <Badge variant="muted">{t('ent.meetings.waiting')}</Badge>}
                    </span>
                    {r && (
                      <p className="whitespace-pre-wrap">
                        <Sensitive length={30}>{r.text}</Sensitive>
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
            {m.status === 'closed' && (
              <section className="grid gap-1.5">
                <h4 className="text-sm font-medium">{t('ent.meetings.minutes')}</h4>
                <p className="text-[13px] whitespace-pre-wrap" data-testid="meeting-minutes">
                  <Sensitive length={40}>{m.minutes || t('ent.meetings.noMinutes')}</Sensitive>
                </p>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
