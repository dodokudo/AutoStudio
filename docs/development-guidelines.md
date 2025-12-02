# Development Guidelines

## Date range handling
- Use `UNIFIED_RANGE_OPTIONS` and `resolveDateRange` from `src/lib/dateRangePresets.ts` for any dashboard date selectors.
- Preset rules: end date is **yesterday 23:59 local time**, start date is calculated by the preset (e.g., past 7 days = yesterday含む直近7日).
- For API/query parameters and labels, format dates with `formatDateInput` (YYYY-MM-DD) from the same helper; avoid UTC-based keys to prevent day shifts.
- When adding a new tab or chart that filters by period, wire the picker to these helpers so all tabs stay consistent.

## General
- Prefer the shared UI picker `DashboardDateRangePicker` with the unified presets.
- If custom ranges are supported, pass the raw `start`/`end` from the picker directly into `resolveDateRange` and propagate the formatted strings to API calls.***
