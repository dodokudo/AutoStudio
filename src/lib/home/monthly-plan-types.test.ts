import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyMonthlyPlan,
  isMonth,
  monthDates,
  percentage,
  targetConversionRows,
  validateMonthlyPlan,
  type MonthlyTask,
} from './monthly-plan-types';
import { getDefaultKpiTarget } from './kpi-types';

test('month bounds include the last day in JST and leap years', () => {
  assert.deepEqual(monthDates('2026-09'), { start: '2026-09-01', end: '2026-09-30' });
  assert.equal(monthDates('2028-02').end, '2028-02-29');
  for (const month of ['2026-00', '2026-13', '2026-9', null]) assert.equal(isMonth(month), false);
});
test('unset goals and unknown actuals do not imply 0% conversion', () => {
  assert.equal(percentage(null, 20), '—');
  assert.equal(percentage(5, 0), '—');
  assert.equal(percentage(0, 20), '0.0%');
  const target = { ...getDefaultKpiTarget('2026-10'), targetBackendPurchases: 5, targetConsultationsCompleted: 20 };
  const rates = targetConversionRows(target);
  assert.equal(rates.at(-1)?.[1], '25.0%');
  assert.equal(rates[3][1], '—');
});
test('monthly task validation protects progress and rejects invalid dates and duplicates', () => {
  const plan = emptyMonthlyPlan('2026-10');
  const task: MonthlyTask = {
    id: 'youtube',
    title: 'YouTube公開',
    total: 4,
    completed: 2,
    dueDate: '',
    status: 'in_progress',
    archived: false,
  };
  plan.tasks = [task];
  assert.equal(validateMonthlyPlan(plan), null);
  assert.ok(validateMonthlyPlan({ ...plan, tasks: [{ ...task, completed: 5 }] }));
  assert.ok(validateMonthlyPlan({ ...plan, tasks: [{ ...task, status: 'done' }] }));
  assert.ok(validateMonthlyPlan({ ...plan, tasks: [{ ...task, dueDate: '2026-02-30' }] }));
  assert.ok(validateMonthlyPlan({ ...plan, tasks: [task, task] }));
  assert.ok(validateMonthlyPlan({ ...plan, activities: { ...plan.activities, consultationsCompleted: -1 } }));
  assert.ok(validateMonthlyPlan({ ...plan, activities: { ...plan.activities, consultationsCompleted: 1.2 } }));
});
test('new months do not inherit other month tasks or activity values', () => {
  const september = emptyMonthlyPlan('2026-09');
  september.activities.consultationRegistrations = 4;
  assert.equal(emptyMonthlyPlan('2026-10').activities.consultationRegistrations, null);
  assert.equal(emptyMonthlyPlan('2026-10').tasks.length, 0);
});
