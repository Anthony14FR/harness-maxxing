// The state of a delegated task as people read it, from the task status and stage.
import type { TKey } from '@/i18n'
import type { EnterpriseTask } from '@/lib/types'

export type TaskGroup = 'todo' | 'doing' | 'review' | 'blocked' | 'done'

export const TASK_GROUPS: { id: TaskGroup; label: TKey }[] = [
  { id: 'todo', label: 'ent.tasks.todo' },
  { id: 'doing', label: 'ent.tasks.doing' },
  { id: 'review', label: 'ent.tasks.review' },
  { id: 'blocked', label: 'ent.tasks.blocked' },
  { id: 'done', label: 'ent.tasks.done' },
]

export function taskGroup(x: Pick<EnterpriseTask, 'status' | 'stage'>): TaskGroup {
  if (x.status === 'done') return 'done'
  if (x.stage === 'blocked') return 'blocked'
  if (x.stage === 'review' || x.stage === 'review_pending' || x.stage === 'changes') return 'review'
  if (x.status === 'doing' || x.status === 'in_progress') return 'doing'
  return 'todo'
}
