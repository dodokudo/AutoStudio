-- Run explicitly during rollout; page rendering and ingestion never create tables.
CREATE TABLE IF NOT EXISTS `mark-454114.autostudio_threads.threads_post_insights_snapshot` (
  snapshot_date DATE NOT NULL,
  snapshot_at TIMESTAMP NOT NULL,
  source STRING NOT NULL,
  account_key STRING NOT NULL,
  account_username STRING NOT NULL,
  post_id STRING NOT NULL,
  post_url STRING NOT NULL,
  root_post_id STRING NOT NULL,
  node_type STRING NOT NULL,
  views INT64,
  reach INT64,
  likes INT64,
  replies INT64,
  reposts INT64,
  quotes INT64,
  shares INT64,
  profile_visits INT64,
  follows INT64,
  views_from_followers INT64,
  views_from_non_followers INT64,
  payload_json STRING,
  received_at TIMESTAMP NOT NULL
)
PARTITION BY snapshot_date
CLUSTER BY account_key, post_id;
