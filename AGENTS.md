# AutoStudio Codex Rules

## Core Workflow

- Prefer implementation over explanation when the task is actionable.
- For UI or dashboard work, inspect the actual render/data path before proposing fixes.
- For production-related work, verify the deployed/runtime state when tools are available; do not rely only on local code state.
- When the user asks to push or deploy, carry the task through validation, commit/push when appropriate, deployment, and URL/runtime verification.

## Deployment & Git — MANDATORY, DO NOT DEVIATE

- Production (asto.jp) is deployed automatically by Vercel from the GitHub `main` branch. This project is connected to GitHub in Vercel: **pushing `main` to GitHub is what deploys production. That is the ONLY approved deploy path.**
- **ALWAYS commit and push directly to `main`.** Do NOT create side branches (e.g. `codex/*`, feature branches) to ship work, and do NOT hand-deploy with local `vercel --prod`.
- Never run `vercel --prod` (or any manual/CLI production deploy) as the normal flow. It desyncs `main` from what is actually live and is forbidden. Push `main` and let Vercel's GitHub integration deploy.
- If a side branch already exists and is serving production, merge it back into `main`, push `main`, and return to the main-only flow. Do not leave production served from a non-`main` branch.
- After pushing `main`, verify the production URL (https://asto.jp) once the auto-deploy is READY.

## UI Layout & Spacing — keep every tab consistent

- All tab content shares ONE width: the `.page-container` wrapper (`min(1680px, 100%)`) inside the shell `main`. Do NOT add per-tab `max-w-*` on the outermost content wrapper — let `.page-container` decide the width.
- All tab content shares ONE vertical rhythm: **24px gaps between top-level cards/sections** (`.section-stack` or `space-y-6`). The LINE tab is the reference. Do NOT introduce 48px/`gap-12`/`space-y-12` rhythms at the section level.
- The space above the top sub-tab bar equals the space below it (both 24px). This comes from the shell `main` `pt-6`; do not re-inflate it per tab.
- When building a NEW tab, wrap its content in `<div className="section-stack">…</div>` (or `space-y-6`) and rely on `.page-container` for width, so it matches every existing tab without extra work.

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
- Before proposing new Instagram Reel scripts or creative angles, include competitor review for the relevant accounts, especially `mon_guchi` and `sugisan_insta_`.
- Do not stop at surface-level competitor conclusions such as "do/don't do this." Check the winning posts' opening seconds, visual proof, caption/framing, view count, comments, and whether the post is built around proof, demonstration, warning, or personal authority.
- If competitor transcript or visual data is missing, say that clearly and collect it before making a confident creative recommendation.

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
