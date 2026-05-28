# AutoStudio Codex Rules

## Core Workflow

- Prefer implementation over explanation when the task is actionable.
- For UI or dashboard work, inspect the actual render/data path before proposing fixes.
- For production-related work, verify the deployed/runtime state when tools are available; do not rely only on local code state.
- When the user asks to push or deploy, carry the task through validation, commit/push when appropriate, deployment, and URL/runtime verification.

## Instagram Dashboard And BigQuery

- If `/instagram` or another dashboard is slow, first trace request-time work: server render queries, eager initialization, BigQuery calls, and cache boundaries.
- Do not treat partial lazy loading as sufficient until initial page load is fast enough to use.
- Prefer moving heavy tab-specific data behind API routes and caching already-fetched tab data client-side.
- Be careful when changing shared dashboard utilities; `src/lib/instagram/dashboard.ts` may affect other dashboard views.

## Reel Transcription And Script Generation

- Treat transcription and script generation as separate pipeline stages.
- Before claiming script generation is live, check the actual script table/state such as `my_reels_scripts` and the relevant scheduler/job setup.
- Preserve the distinction between local Mac tooling and cloud/API processing:
  - Local Whisper/ffmpeg paths may not be Cloud Run portable.
  - Gemini/API-based transcription is the cloud-friendly path when configured.
- For Cloud Run/Scheduler work, verify the specific job, schedule, latest execution, image/generation, and required secrets.

## LaunchKit LP Tracking

- LaunchKit LP registration is something the agent should do, not something the user should manually do in the admin screen.
- For new LaunchKit LPs, register the LP before reporting the LP as complete.
- Production `POST /api/launchkit/lps` is behind AutoStudio login middleware and unauthenticated curl redirects to `/login`. Do not assume plain curl can create an LP.
- Until a token-authenticated registration API exists, the reliable agent route is direct BigQuery insertion into `mark-454114.autostudio_links.launchkit_lps` with the same fields AutoStudio writes internally. This was verified with an INSERT -> SELECT -> DELETE self-test.
- Required registration fields: `name`, `slug`, `url`, `genre`, `source`, and `line_cta_url`.
- Use `https://lkit.jp/{slug}` as the LP public URL in `launchkit_lps.url`.
- Treat `https://asto.jp/l/{code}` as the short-link/redirect flow, not as the LaunchKit LP public URL. Do not use it for new direct-LP tracking unless the user explicitly asks for a short link.
- `genre` should be one of `opt`, `seminar`, `consult`, `other`; `source` should be one of `threads`, `instagram`, `ad`, `note`, `youtube`, `other`.
- The LP HTML must include `window.LAUNCHKIT_TRACKING` with the new AutoStudio `lpId`, and all `liff.line.me` CTA links must have `data-launchkit-line-cta`.
- When a tracked LP is cloned, verify no old `lpId` or old tracking script slug remains.
- Do not call LaunchKit LP work complete until `page_view` and `line_cta_click` events are verified against `/api/launchkit/events` and confirmed in `mark-454114.autostudio_links.launchkit_events`.

## Verification

- Prefer `npm run typecheck` for TypeScript checks when available.
- Run `npm run build` before deploys or significant UI/server changes when practical.
- If `next build` fails after typecheck passes, check for environmental fetch/network issues before assuming the app code regressed.
- For BigQuery or scheduled jobs, verify data actually changed or the latest execution succeeded.
