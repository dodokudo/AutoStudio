# AutoStudio YouTube Module – Specification

## 1. Purpose & Scope
- Consolidate YouTube research → theme ideation → script generation into the existing AutoStudio dashboard.
- Support future multi-channel expansion (Instagram, LINE funnel) by storing cross-media data in a shared schema.
- Surface daily insights, hot keywords, and ready-to-edit scripts, while syncing final drafts to Notion where ongoing manuscript edits already live.

## 2. System Overview
```
YouTube Data API (competitor + public data)
          │ (nightly sync, API key)
          ▼
BigQuery dataset: autostudio_media
  ├─ media_channels_snapshot
  ├─ media_videos_snapshot
  ├─ media_video_themes
  ├─ media_content_scripts
  ├─ media_metrics_daily
  └─ media_content_scripts
          ▲
          │ (OAuth refresh token)
YouTube Analytics API (own channel performance)

Claude (script generator) ◄────┐
                               │ payload builder (AutoStudio)
AutoStudio Next.js dashboard ──┴─► Notion DB (content hub)
                                   │  ↑
                                   │  └─ MCP integration for editing / existing pages
```

## 3. BigQuery Dataset & Tables
All media data is stored in dataset **`autostudio_media`** (region: `asia-northeast1`). Each table includes a `media` column so Threads/Instagram modules can reuse the schema.

| Table | Purpose | Key columns |
| --- | --- | --- |
| `media_channels_snapshot` | Daily snapshot of channel-level stats (competitor + self) | `media`, `channel_id`, `channel_title`, `handle`, `country`, `subscriber_count`, `view_count`, `video_count`, `snapshot_date`, `collected_at`, `is_self` |
| `media_videos_snapshot` | Latest metadata/metrics per video | `media`, `content_id`, `channel_id`, `title`, `description`, `tags` (ARRAY<STRING>), `published_at`, `duration_seconds`, `view_count`, `like_count`, `comment_count`, `view_velocity`, `engagement_rate`, `snapshot_date`, `collected_at` |
| `media_video_themes` | Derived hot-theme candidates | `media`, `theme_keyword`, `source_type` (`"velocity_top"` / `"outlier"`), `score`, `supporting_video_ids` (ARRAY<STRING>), `supporting_channels` (ARRAY<STRING>), `view_velocity_avg`, `days_window`, `generated_at` |
| `media_metrics_daily` | Self-channel Analytics API metrics | `media`, `date`, `metric_type`, `value`, `dimension_values` (e.g., `{"country":"JP"}`), `collected_at` |
| `media_content_scripts` | AutoStudio-generated assets | `media`, `content_id` (UUID), `theme_keyword`, `target_persona`, `video_type`, `status`, `notion_page_id`, `generated_at`, `updated_at`, `author`, `payload_json` (Claude prompt + response), `summary` |

Foreign keys are logical (no enforced constraints). `media` should use lowercase identifiers (`"youtube"`, `"threads"`, `"instagram"`, `"line"`).

## 4. Data Pipelines
### 4.1 Competitor Snapshot (YouTube Data API)
- Triggered daily at 06:00 JST via Cloud Scheduler (or local `npm run youtube:sync`).
- Inputs: competitor channel IDs defined in BigQuery table or `.env` list `YOUTUBE_COMPETITOR_IDS`.
- Steps:
  1. Fetch channel statistics via `channels.list` (parts: `snippet,statistics,brandingSettings`).
  2. Resolve each channel’s uploads playlist → page through `playlistItems.list` to collect recent N (=50) videos published within the last 180 days.
  3. Fetch batched video stats via `videos.list` (parts: `snippet,statistics,contentDetails`).
  4. Calculate derived fields: `duration_seconds`, `view_velocity = viewCount / max(days_since_publish,1)`, `engagement_rate = (likes + comments) / max(viewCount,1)`.
  5. Upsert snapshots into BigQuery tables using partition key `snapshot_date`. Old rows for the same `snapshot_date` + `content_id` are replaced.

### 4.2 Self Analytics Snapshot (YouTube Analytics API)
- Uses OAuth refresh token (service accounts are unsupported).
- Once per day, pull the previous day’s metrics with dimensions `[day]` and `[insightTrafficSourceType]`.
- Metrics to capture: `views`, `estimatedMinutesWatched`, `averageViewDuration`, `averageViewPercentage`, `subscribersGained`, `subscribersLost`, `engagedViews`, `likes`, `comments`, `shares`.
- Store each metric-dimension pair as a row in `media_metrics_daily` with JSON column `dimension_values`.
- Keep a rolling 18-month history (delete rows older than 550 days during each run).

### 4.3 Theme Detection Job
- Runs immediately after snapshots.
- Logic:
  1. Filter `media_videos_snapshot` for `media = 'youtube'`, `snapshot_date >= CURRENT_DATE() - 30`.
  2. Rank videos by `view_velocity` and mark top 20% as `velocity_top`.
  3. Compute per-channel baseline (median view count) for the last 180 days; mark videos whose `view_count` ≥ 3 × median as `outlier`.
  4. Extract keywords from `title + description + tags` using TF-IDF + heuristics (remove stopwords, keep nouns/NP). Implementation: use `natural` package or own simple frequency. Output top 3 keywords per video.
  5. Aggregate keywords → compute `score = Σ(view_velocity_normalized)` and capture `supporting_video_ids`, `supporting_channels`.
  6. Write results to `media_video_themes` with `generated_at` timestamp.

### 4.4 Script Generation Job
- When user selects a theme in AutoStudio UI, call Claude with payload:
  - Theme keyword + supporting videos summary.
  - Self-channel analytics (recent averages, audience profile).
  - Prompt template (the one provided by Kudo; stored in repo under `docs/prompts/youtube-script.md`).
  - Video type, target persona (pull defaults or user input).
- Save raw request/response JSON into `media_content_scripts` and create/update corresponding Notion page.
- Update Notion page status to `Draft` and populate properties (see §6).

## 5. Notion Integration
### 5.1 Database Structure (`AutoStudio Content Hub`)
Create a new Notion database with the following properties:
- `Name` (Title) — script/theme title.
- `Media` (Select) — options: `Threads`, `YouTube`, `Instagram`, `LINE`.
- `Content Type` (Select) — `Theme Idea`, `Script Draft`, `Published Video`, `Reference`.
- `Status` (Select) — `Idea`, `Draft`, `Review`, `Ready`, `Published`, `Archived`.
- `AutoStudio ID` (Text) — UUID generated by the app for bi-directional sync.
- `Target Persona` (Multi-select) — optional labels (e.g., `初心者マーケ`, `経営層`).
- `Theme Keyword` (Text).
- `Source Videos` (URL, multi-value via rich text).
- `Generated At` (Date).
- `Last Synced` (Date, auto-updated by app).
- `Claude Template` (Text) — whichever structure (機能紹介/ノウハウ etc).

Existing script pages can be migrated by adding the properties above and filling `AutoStudio ID` manually to match the ID shown in AutoStudio (optional).

### 5.2 Integration Setup Steps for Kudo
1. Open Notion → Settings → My connections → **Develop or manage integrations**.
2. Create a new internal integration named “AutoStudio”. Enable capabilities: `Read content`, `Update content`, `Insert content`, `Search`.
3. Copy the “Internal Integration Token” and add it to `.env.local` as `NOTION_API_TOKEN`.
4. Share the target database (and any existing script pages) with the AutoStudio integration (Share → “Connect to” → select integration).
5. Open the database as a page, copy the URL, and note the 32-character database ID. Store as `NOTION_CONTENT_DATABASE_ID` in `.env.local`.
6. In Notion MCP (screenshot), choose “Other AI tools” → “Connect” → paste the same integration token. This allows AutoStudio’s MCP tools to read/write pages when you interact inside Notion.

## 6. Environment Variables
| Name | Description |
| --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Existing Base64 service account for BigQuery (already in place). |
| `YOUTUBE_API_KEY` | API key for YouTube Data API v3 (competitor data). |
| `YOUTUBE_CHANNEL_ID` | Self channel ID for analytics aggregation. |
| `YOUTUBE_COMPETITOR_IDS` | Comma-separated channel IDs to track (UI also allows CRUD). |
| `YOUTUBE_OAUTH_CLIENT_ID` | OAuth client ID (installed app). |
| `YOUTUBE_OAUTH_CLIENT_SECRET` | OAuth client secret. |
| `YOUTUBE_OAUTH_REFRESH_TOKEN` | Refresh token granted with scopes `youtube.readonly`, `yt-analytics.readonly`, `yt-analytics-monetary.readonly` (optional if revenue metrics needed). |
| `NOTION_API_TOKEN` | Notion internal integration token. |
| `NOTION_CONTENT_DATABASE_ID` | Database ID for AutoStudio Content Hub. |
| `CLAUDE_SCRIPT_MODEL` | Override Claude model for scripts (default `claude-3-5-sonnet-latest`). |

## 7. AutoStudio UI Additions
- **Navigation**: enable `/youtube` tab.
- **Sections**:
  1. Overview cards — total subscribers, 30-day views, avg view duration, WoW change (from `media_metrics_daily`).
  2. Hot Themes — list from `media_video_themes`, showing score, supporting videos, primary competitors, button to “Generate Script”.
  3. Competitor Radar — table of latest competitor videos (title, views, velocity, posted days ago).
  4. Script Queue — list `media_content_scripts` filtered by status; display Notion sync status and allow opening the Notion page.
- **Theme → Script Flow**:
  - Modal to choose `動画タイプ`, `ターゲット`, optional reference video(s).
  - On submit, call `/api/youtube/scripts` which orchestrates Claude generation, stores BigQuery row, upserts Notion page.

## 8. API Routes & Scripts
- `src/app/api/youtube/competitors/route.ts` — GET/POST for CRUD of competitor list (backed by BigQuery table or JSON config).
- `src/app/api/youtube/themes/route.ts` — GET aggregated themes.
- `src/app/api/youtube/scripts/route.ts` — GET: 直近スクリプト一覧, POST: Claude生成→Notion同期→BigQuery保存。
- CLI scripts:
  - `npm run youtube:sync` → `src/scripts/runYoutubeSync.ts` (channels + videos + analytics + theme derivation).
  - `npm run youtube:oauth` → helper to perform OAuth flow and print refresh token (one-off).

## 9. Claude Prompt Handling
- Store the provided master prompt under `docs/prompts/youtube-script.md`.
- Prompt builder merges:
  - Theme summary (keyword, goal, competitor context).
  - Self-channel analytics snippet (top metrics, audience segments if available).
  - Past script metrics (if `media_content_scripts` contains previous results for the theme).
  - Configurable template selection (`機能紹介系`, `ノウハウ系`, `比較検証系`, `ストーリー系`).
- Response parser ensures required fields (OP, body sections, ED message) and attaches to Notion page.

## 10. Error Handling & Monitoring
- All CLI/background jobs log to stderr/stdout. Failures trigger email via existing notification utility (reuse `notifications.ts`).
- BigQuery upserts use `MERGE` to avoid duplicates; operations wrapped in retries for quota errors.
- Analytics API quota/backoff: exponential `2^n` seconds, max 5 retries.
- Notion sync keeps `Last Synced` field updated; if Notion API fails, mark script status as `needs_sync` for manual retrial.

## 11. Future Work Hooks
- Extend `media_video_themes` scoring with CTR once YouTube Analytics exposes impressions.
- Add Instagram ingestion by reusing `media` column and adding new data source.
- Implement two-way sync: when Notion page edited, webhook (via scheduled diff) writes back to `media_content_scripts`.
- Visualize full funnel by joining with LINE dataset using shared `media` dimension.

---
This specification guides implementation of the YouTube automation workflow while keeping the architecture extensible for other media channels.
