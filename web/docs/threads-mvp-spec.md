# AutoStudio Threads MVP – Specification

## 1. Purpose & Context
- Build the first module of AutoStudio to automate Threads posting for the kudooo_sns.marke account.
- Marketing goal: publish 10 high-quality posts per day, sustain follower growth, and maximize impressions.
- Engineering goal: deliver an end-to-end workflow (analysis → generation → approval → scheduling → logging) ready to extend to future YouTube/Instagram tools.

## 2. System Overview
```
Google Sheets (Threads / Threads post)
        │ (read-only sync)
        ▼
BigQuery staging tables (mark-454114.autostudio_threads)
        ├─► Daily metrics + post stats + competitor data
        │
        ├─► Claude AI (content generation + template learning)
        │
        ├─► Next.js (AutoStudio dashboard on Vercel)
        │        ├─ Insights + competitor highlights
        │        ├─ Post approval + editing + scheduling
        │        └─ Template improvement prompts
        ▼
Threads API (publish main post + comments) → Posting logs (BigQuery + Sheets)
```

## 3. Data Sources & Synchronization
### 3.1 Google Sheets (existing, read-only)
- `Threads`: columns `Date`, `Followers (Snapshot)`, `Profile Views`, ...
- `Threads post`: columns include `投稿ID`, `投稿日`, `投稿内容`, `閲覧数`, `いいね`, ...
- Updated daily via existing GAS scripts; AutoStudio lives in consumer role.
- 同期コマンド: `npm run sync:threads`（Google Sheets → BigQuery、競合日次指標と投稿を同期）

### 3.2 BigQuery Tables
- **Project**: `mark-454114`
- **Dataset**: `autostudio_threads` (region: `asia-northeast1`)

| Table | Purpose | Key Fields |
| --- | --- | --- |
| `threads_daily_metrics` | 7-day followers/profile views trend | `date`, `followers_snapshot`, `profile_views`, `collected_at` |
| `threads_posts` | Canonical record per post | `post_id`, `posted_at`, `content`, `impressions_total`, `likes_total`, `template_id`, `updated_at` |
| `threads_post_stats_daily` | Daily deltas for first 72h | `date`, `post_id`, `impressions_delta`, `likes_delta` |
| `threads_prompt_templates` | Prompt/template registry | `template_id`, `version`, `theme_tag`, `structure_notes`, `status`, `created_at` |
| `threads_prompt_template_scores` | Performance history per template | `template_id`, `generated_at`, `impression_avg72h`, `like_avg72h`, `follower_delta`, `status`, `notes` |
| `competitor_posts_raw` | Direct import from secretary sheet | source-aligned fields |
| `competitor_posts_enriched` | Adds AI tags (theme, hook, CTA style) | derived columns + `enriched_at` |
| `competitor_trends_daily` | Aggregated trends | `date`, `theme_tag`, `avg_impressions`, `wow_change` |
| `competitor_account_daily` | Raw daily metrics per competitor | `account_name`, `username`, `date`, `followers`, `followers_delta`, `posts_count`, `views`, `collected_at` |
| `thread_post_plans` | Generated posting plans | `plan_id`, `generation_date`, `scheduled_time`, `template_id`, `theme`, `status`, `main_text`, `comments`, `created_at`, `updated_at` |
| `thread_post_jobs` | Queue of posts awaiting publication | `job_id`, `plan_id`, `scheduled_time`, `status`, `attempt_count`, `payload`, `created_at`, `updated_at` |
| `thread_posting_logs` | Posting results | `log_id`, `job_id`, `plan_id`, `status`, `posted_thread_id`, `error_message`, `posted_at`, `created_at` |

## 4. Evaluation Rules
- **Account health**: show 7-day moving averages with WoW delta for profile views & followers.
- **Post performance**: evaluate by impressions at 24h/48h/72h. Define "performer" template when 72h impressions ≥ median + X% (threshold configurable).
- **Template lifecycle**:
  - `active`: currently used for generation.
  - `candidate`: newly generated or modified; requires approval.
  - `needs_review`: underperforming three times in a row.
  - UI supports version comparison and rollback.

## 5. AI Generation Workflow (Claude-centric)
1. Sync data at **midday on day N** for **day N+1** posting.
2. Build structured prompt with sections:
   - Account summary (7-day stats + notable changes).
   - Top 5 self posts (72h metrics, extracted hook, CTA, structure tags).
   - Top 3 competitor posts (theme, structure, impressions).
   - Latest AI/marketing topics (secretary sheet + curated news summary).
   - Current template inventory & performance flags.
   - Improvement notes (what should be tweaked, e.g., hook variety).
3. Claude responds with JSON matching schema:
```json
{
  "meta": {
    "generation_id": "2025-09-23",
    "target_post_count": 10,
    "recommended_schedule": ["07:00", "08:30", ...]
  },
  "posts": [
    {
      "template_id": "hook_negate_v3",
      "theme_tag": "AI_efficiency",
      "main_post": {
        "text": "...",
        "hook_type": "逆説",
        "target_pain": "時間不足"
      },
      "comments": [
        { "order": 1, "text": "...", "purpose": "詳細解説" },
        { "order": 2, "text": "...", "purpose": "CTA" }
      ],
      "related_posts": ["17987175662845358"],
      "reasoning": "Based on post 2025-09-21 and competitor @mon_guchi ..."
    }
  ]
}
```
4. 実装済みユーティリティ `npm run prompt:preview` で上記スキーマ準拠の入力 JSON を BigQuery から生成し、提案内容を確認できる。
5. Persist generation payload in BigQuery + local storage to allow audit and re-generation.
6. Feed back actual performance (after 72h) to `threads_prompt_template_scores`.
7. `npm run worker:threads` で承認済みプランの投稿ジョブを処理し、`thread_posting_logs` に結果を記録する。
8. `npm run templates:update` で投稿後72時間経過した成功ログを集計し、テンプレート評価テーブルを更新する。

## 6. Approval & Scheduling UX
- **Dashboard layout**:
  1. Overview cards: 7-day metrics, top movers.
  2. Competitive feed: best competitor posts + structure tags.
  3. "Tomorrow's queue": editable cards for each of the 10 posts.
- **Per post card** includes:
  - Main + comments editor with character count.
  - Template metadata (ID, version, last avg impressions).
  - Suggested schedule time (editable dropdown + manual entry).
  - Related/quoted post controls.
  - Buttons: `Approve`, `Reject`, `Clone`, `Mark priority`.
- **Backend routes** (`/api` under Next.js):
  - `GET /threads/insights-summary`
  - `GET /threads/plans`
  - `PUT /threads/plans/:id`
  - `POST /threads/plans/:id/approve`
  - `POST /threads/plans/:id/reject`
  - `POST /threads/plans/:id/rerun`
  - `POST /threads/jobs/run`
- `POST /threads/generate`
- `POST /threads/cron/run`
- `GET /threads/dashboard`
- `GET /threads/prompt`
- `POST /threads/prompt`
  - `POST /threads/publish` (worker endpoint for scheduled jobs)
  - `GET /threads/logs`

## 7. Publishing Engine
- Persist approved plans as jobs with fields: `job_id`, `post_id`, `scheduled_at`, `status`, `payload`, `template_id`.
- Worker executes (hosted or Vercel cron):
  1. Threads API `POST /me/threads` for main post, wait for container ready.
  2. Publish → capture `mediaId`.
  3. Loop comments: reply to published post; respect rate limits.
  4. Retry (exponential backoff, max 3). On failure store `error_code`, `error_message`.
- Log outcomes to `threads_posting_logs` + append to Google Sheet if needed.

## 8. Competitor Data Pipeline
- Secretary sheet ingestion (daily):
  - Normalize columns → `competitor_posts_raw`.
  - AI enrichment (Claude/Gemini) to tag hook types, CTA styles, topic categories → `competitor_posts_enriched`.
  - Aggregate into trend snapshots for dashboard + prompt input.
- UI surfaces:
  - Latest trending themes vs self performance gap.
  - Recommended structure updates for AutoStudio templates.

## 9. Security & Ops
- Env variables managed via Vercel dashboard: `THREADS_TOKEN`, `THREADS_BUSINESS_ID`, `THREADS_ACCOUNT_ID`, `CLAUDE_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` (for BigQuery).
- Sheets read-only service account; BigQuery minimum required roles.
- Failure notifications: Slack/webhook on publishing or sync errors.
- Monitor Meta API announcements to upgrade competitor data acquisition when official endpoints become available.

## 10. Future Extensions
- Apply same architecture for Tool 2/3 (YouTube scripts, Instagram research) by adding new tabs & ML pipelines.
- Introduce automated A/B testing for hooks/CTAs once stable.
- Integrate LINE (L-STEP) funnel data from Tool 4 to close the loop on conversions.

---
This document is the single source of truth for engineering and marketing when implementing Threads MVP inside AutoStudio.
## 🔧 環境変数と通知

- `ALERT_EMAIL_ENABLED=true` にすると、投稿ジョブ失敗や Claude 生成失敗時にメール通知を送信します。
- SMTP の設定として `ALERT_EMAIL_FROM`, `ALERT_EMAIL_TO`, `ALERT_SMTP_HOST`, `ALERT_SMTP_PORT`, `ALERT_SMTP_USER`, `ALERT_SMTP_PASS` を指定してください。
- Cron 実行の例
  - 毎日 12:00 に投稿案生成: `POST /api/threads/generate`
  - 15分おきにジョブ処理＆テンプレ評価: `POST /api/threads/cron/run`
