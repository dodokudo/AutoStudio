# Dashboard UI Components (2025 Refresh)

To keep analytics screens consistent across Home / Threads / Instagram / YouTube / LINE, use the shared dashboard components introduced in the 2025 refresh.

## Components

| Component | Location | Notes |
| --------- | -------- | ----- |
| `DashboardTabs` | `src/components/dashboard/DashboardTabs.tsx` | Server-friendly tab renderer using anchor links. Use when navigation is URL-driven (e.g. server route params). |
| `DashboardTabsInteractive` | `src/components/dashboard/DashboardTabsInteractive.tsx` | Client-side tab controller. Pass `{ id, label }[]`, current `value`, and an `onChange` handler. Matches Threads-style underline tabs. |
| `DashboardDateRangePicker` | `src/components/dashboard/DashboardDateRangePicker.tsx` | LINE-style period selector. Supports preset options and optional custom range inputs. Always include `'yesterday'`, `'7d'`, `'30d'`, `'90d'`, plus `'custom'` when ranges are user-defined. |
| `dashboardCardClass` | `src/components/dashboard/styles.ts` | Base utility class for summary cards (border, surface, shadow, padding). Apply via `className={dashboardCardClass}`. |

### Date Range Picker Usage

```tsx
const OPTIONS = [
  { value: 'yesterday', label: '昨日' },
  { value: '7d', label: '7日間' },
  { value: '30d', label: '30日間' },
  { value: '90d', label: '90日間' },
  { value: 'custom', label: 'カスタム' },
];

<DashboardDateRangePicker
  options={OPTIONS}
  value={selected}
  onChange={handlePresetChange}
  allowCustom
  customStart={customStart}
  customEnd={customEnd}
  onCustomChange={handleCustomRangeChange}
  latestLabel={selected === 'custom' ? `${customStart} 〜 ${customEnd}` : `最新 ${latestDate}`}
/>
```

- Removing the extra “過去◯日” label beside the selector keeps the layout consistent.
- When `value === 'custom'`, the picker renders inline date inputs; wire them to `onCustomChange`.

### Tabs

To mirror the Threads tab experience:

```tsx
const tabs = [
  { id: 'overview', label: '概要' },
  { id: 'insights', label: 'インサイト' },
];

<DashboardTabsInteractive
  items={tabs}
  value={activeTab}
  onChange={(next) => setActiveTab(next as TabKey)}
/>
```

For anchor-driven navigation (e.g. server routes), use `DashboardTabs` with `{ id, label, href }`.

## Layout Guidelines

1. **Top row**: Tabs (left) + date selector (right). Leave space for tabs even on Home (future tab expansion).
2. **Summary cards**: Use `dashboardCardClass` and a `grid gap-4 sm:grid-cols-2 xl:grid-cols-4/5` layout to match YouTube/Line styling.
3. **Spacing**: Wrap dashboards with `section-stack` to inherit global vertical rhythm.

Following this guide keeps new screens aligned with the refreshed dashboard tonality. Update this doc whenever components or defaults evolve.***
