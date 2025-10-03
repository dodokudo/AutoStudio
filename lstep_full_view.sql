-- Lstep友だちデータを元のCSV形式（横持ち）で表示するクエリ
-- BigQueryで実行: https://console.cloud.google.com/bigquery?project=mark-454114

SELECT
  core.snapshot_date,
  core.user_id,
  core.display_name,
  core.friend_added_at,
  core.blocked,
  core.last_msg_at,
  core.scenario_name,
  core.scenario_days,

  -- タグを横持ちに変換（1=あり、0=なし）
  MAX(IF(tags.tag_name = '流入経路：Threads　ポスト', tags.tag_flag, 0)) as tag_threads_post,
  MAX(IF(tags.tag_name = '流入経路：Threads　プロフ', tags.tag_flag, 0)) as tag_threads_prof,
  MAX(IF(tags.tag_name = 'アンケート：回答完了', tags.tag_flag, 0)) as tag_survey_done,
  MAX(IF(tags.tag_name = '目標：月1000万円以上', tags.tag_flag, 0)) as tag_goal_1000m,
  MAX(IF(tags.tag_name = '目標：月500万円以上', tags.tag_flag, 0)) as tag_goal_500m,
  MAX(IF(tags.tag_name = '目標：月300万円以上', tags.tag_flag, 0)) as tag_goal_300m,
  MAX(IF(tags.tag_name = '目標：月100万円以上', tags.tag_flag, 0)) as tag_goal_100m,
  MAX(IF(tags.tag_name = '目標：月50万円以上', tags.tag_flag, 0)) as tag_goal_50m,
  MAX(IF(tags.tag_name = '目標：月10万円以上', tags.tag_flag, 0)) as tag_goal_10m,

  -- 流入経路
  MAX(IF(sources.source_name = 'Instagram', sources.source_flag, 0)) as source_instagram,
  MAX(IF(sources.source_name = 'Threads', sources.source_flag, 0)) as source_threads,

  -- アンケート回答（例：年代）
  MAX(IF(surveys.question = '60代', surveys.answer_flag, 0)) as survey_60s,
  MAX(IF(surveys.question = '50代', surveys.answer_flag, 0)) as survey_50s,
  MAX(IF(surveys.question = '40代', surveys.answer_flag, 0)) as survey_40s,
  MAX(IF(surveys.question = '30代', surveys.answer_flag, 0)) as survey_30s,
  MAX(IF(surveys.question = '20代', surveys.answer_flag, 0)) as survey_20s

FROM
  `mark-454114.autostudio_lstep.user_core` core
LEFT JOIN
  `mark-454114.autostudio_lstep.user_tags` tags
  ON core.user_id = tags.user_id AND core.snapshot_date = tags.snapshot_date
LEFT JOIN
  `mark-454114.autostudio_lstep.user_sources` sources
  ON core.user_id = sources.user_id AND core.snapshot_date = sources.snapshot_date
LEFT JOIN
  `mark-454114.autostudio_lstep.user_surveys` surveys
  ON core.user_id = surveys.user_id AND core.snapshot_date = surveys.snapshot_date

WHERE
  core.snapshot_date = '2025-10-04'

GROUP BY
  core.snapshot_date,
  core.user_id,
  core.display_name,
  core.friend_added_at,
  core.blocked,
  core.last_msg_at,
  core.scenario_name,
  core.scenario_days

ORDER BY
  core.friend_added_at DESC

LIMIT 100
