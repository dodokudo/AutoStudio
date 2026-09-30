'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { dashboardCardClass } from '@/components/dashboard/styles';
import { activityFields, validateMonthlyPlan, type MonthlyPlan, type MonthlyTask } from '@/lib/home/monthly-plan-types';

const fieldClass =
  'rounded border border-[color:var(--color-border)] bg-[color:var(--color-surface)] px-3 py-2 text-sm';
export function MonthlyPlanSection({
  plan,
  onSave,
  saving,
}: {
  plan: MonthlyPlan;
  onSave: (plan: MonthlyPlan) => Promise<void>;
  saving: boolean;
}) {
  const [editing, setEditing] = useState<MonthlyTask | null>(null);
  const [error, setError] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const active = plan.tasks.filter((task) => !task.archived);
  const done = active.filter((task) => task.status === 'done').length;
  async function update(task: MonthlyTask) {
    const next = {
      ...plan,
      tasks: plan.tasks.some((t) => t.id === task.id)
        ? plan.tasks.map((t) => (t.id === task.id ? task : t))
        : [...plan.tasks, task],
    };
    const invalid = validateMonthlyPlan(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError('');
    try {
      await onSave(next);
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました');
    }
  }
  return (
    <Card className={dashboardCardClass}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">今月やること</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-muted)]">
            {done} / {active.length} 件完了{active.length > 0 ? ` · ${Math.round((done / active.length) * 100)}%` : ''}
          </p>
        </div>
        <Button
          type="button"
          disabled={saving || !!editing}
          onClick={() =>
            setEditing({
              id: crypto.randomUUID(),
              title: '',
              status: 'todo',
              completed: 0,
              total: 1,
              dueDate: '',
              archived: false,
            })
          }
        >
          タスクを追加
        </Button>
      </div>
      {active.length > 0 && (
        <div className="mt-4 h-2 rounded-full bg-[color:var(--color-border)]">
          <div
            className="h-2 rounded-full bg-[color:var(--color-accent)]"
            style={{ width: `${(done / active.length) * 100}%` }}
          />
        </div>
      )}
      {editing && (
        <form
          className="mt-4 space-y-3 rounded border border-[color:var(--color-border)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void update(editing);
          }}
        >
          <label className="block text-sm">
            タスク名
            <input
              autoFocus
              required
              maxLength={300}
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              className={`${fieldClass} mt-1 w-full`}
            />
          </label>
          <div className="flex flex-wrap gap-4">
            <label className="text-sm">
              状態
              <select
                value={editing.status}
                onChange={(e) => {
                  const status = e.target.value as MonthlyTask['status'];
                  setEditing({
                    ...editing,
                    status,
                    completed:
                      status === 'done' ? editing.total : editing.completed === editing.total ? 0 : editing.completed,
                  });
                }}
                className={`${fieldClass} ml-2`}
              >
                <option value="todo">未着手</option>
                <option value="in_progress">進行中</option>
                <option value="done">完了</option>
              </select>
            </label>
            <label className="text-sm">
              進捗
              <input
                aria-label="タスクの完了数"
                type="number"
                required
                min="0"
                max={editing.total}
                step="1"
                value={editing.completed}
                onChange={(e) => {
                  const completed = Number(e.target.value);
                  setEditing({
                    ...editing,
                    completed,
                    status: completed === editing.total ? 'done' : completed > 0 ? 'in_progress' : 'todo',
                  });
                }}
                className={`${fieldClass} ml-2 w-20`}
              />
            </label>
            <label className="text-sm">
              目標数
              <input
                type="number"
                required
                min="1"
                step="1"
                value={editing.total}
                onChange={(e) => {
                  const total = Number(e.target.value);
                  setEditing({
                    ...editing,
                    total,
                    status: editing.completed === total ? 'done' : editing.completed > 0 ? 'in_progress' : 'todo',
                  });
                }}
                className={`${fieldClass} ml-2 w-20`}
              />
            </label>
            <label className="text-sm">
              期限（任意）
              <input
                type="date"
                value={editing.dueDate}
                onChange={(e) => setEditing({ ...editing, dueDate: e.target.value })}
                className={`${fieldClass} ml-2`}
              />
            </label>
          </div>
          <div className="flex gap-3">
            <Button type="submit" disabled={saving}>
              保存
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving}
              onClick={() => {
                setEditing(null);
                setError('');
              }}
            >
              キャンセル
            </Button>
          </div>
        </form>
      )}
      {!active.length && !editing && (
        <p className="mt-4 text-sm text-[color:var(--color-text-muted)]">今月取り組むことを追加してください。</p>
      )}
      <div className="mt-4 divide-y divide-[color:var(--color-border)]">
        {plan.tasks
          .filter((task) => showArchived || !task.archived)
          .map((task) => (
            <div
              key={task.id}
              className={`flex flex-wrap items-center gap-3 py-3 ${task.archived ? 'opacity-60' : ''}`}
            >
              <input
                aria-label={`${task.title}を完了にする`}
                type="checkbox"
                checked={task.status === 'done'}
                disabled={saving || !!editing || task.archived}
                onChange={(e) =>
                  void update({
                    ...task,
                    status: e.target.checked ? 'done' : 'todo',
                    completed: e.target.checked ? task.total : 0,
                  })
                }
              />
              <div className="min-w-[180px] flex-1">
                <p
                  className={
                    task.status === 'done'
                      ? 'text-sm line-through text-[color:var(--color-text-muted)]'
                      : 'text-sm font-medium'
                  }
                >
                  {task.title}
                </p>
                <p className="mt-1 text-xs text-[color:var(--color-text-muted)]">
                  {task.archived
                    ? '保管済み'
                    : task.status === 'done'
                      ? '完了'
                      : task.status === 'in_progress'
                        ? '進行中'
                        : '未着手'}
                  {task.total > 1 ? ` · ${task.completed} / ${task.total}` : ''}
                  {task.dueDate ? ` · ${task.dueDate.slice(5).replace('-', '/')}まで` : ''}
                </p>
              </div>
              <button
                type="button"
                disabled={saving || !!editing}
                onClick={() => setEditing({ ...task })}
                className="text-xs text-[color:var(--color-accent)]"
              >
                編集
              </button>
              <button
                type="button"
                disabled={saving || !!editing}
                onClick={() => void update({ ...task, archived: !task.archived })}
                className="text-xs text-[color:var(--color-text-muted)]"
              >
                {task.archived ? '戻す' : '保管'}
              </button>
            </div>
          ))}
      </div>
      {plan.tasks.some((task) => task.archived) && (
        <button
          type="button"
          onClick={() => setShowArchived(!showArchived)}
          className="mt-3 text-xs text-[color:var(--color-text-muted)]"
        >
          {showArchived ? '保管済みを隠す' : '保管済みを表示'}
        </button>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-500">
          {error}
        </p>
      )}
    </Card>
  );
}

export function ActivityActualsForm({
  plan,
  onSave,
  saving,
}: {
  plan: MonthlyPlan;
  onSave: (plan: MonthlyPlan) => Promise<void>;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(plan.activities);
  const [message, setMessage] = useState('');
  if (!editing)
    return (
      <button
        type="button"
        className="text-sm text-[color:var(--color-accent)]"
        onClick={() => {
          setValues(plan.activities);
          setMessage('');
          setEditing(true);
        }}
      >
        申込み・相談実績を入力
      </button>
    );
  return (
    <form
      className="mt-4 space-y-4 rounded border border-[color:var(--color-border)] p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setMessage('');
        try {
          await onSave({ ...plan, activities: values });
          setEditing(false);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : '保存に失敗しました');
        }
      }}
    >
      <p className="text-sm">{plan.month}の累計を入力</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {activityFields.map(([key, label]) => (
          <label key={key} className="text-sm">
            {label}
            <input
              aria-label={`${label}の実績`}
              type="number"
              min="0"
              step="1"
              placeholder="未入力"
              value={values[key] ?? ''}
              onChange={(e) => setValues({ ...values, [key]: e.target.value === '' ? null : Number(e.target.value) })}
              className={`${fieldClass} ml-2 w-24`}
            />
          </label>
        ))}
      </div>
      <div className="flex gap-3">
        <Button type="submit" disabled={saving}>
          実績を保存
        </Button>
        <Button type="button" variant="secondary" disabled={saving} onClick={() => setEditing(false)}>
          キャンセル
        </Button>
      </div>
      {message && (
        <p role="alert" className="text-sm text-red-500">
          {message}
        </p>
      )}
    </form>
  );
}
