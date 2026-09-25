# 競合Threads投稿の閲覧数収集（autostudio-threads-research-views）

- 何をする: research_posts にある直近14日の投稿URLを、ログインなしで開いて「表示N回」を読み、`autostudio_threads.research_post_views` に1日1行ずつ保存する
- スケジュール: 毎日 04:45 JST（Cloud Scheduler `autostudio-threads-research-views-daily`）。04:15のVercel cron（投稿収集）の後
- ローカル実行: `npm run research:views -- --days=14`
- デプロイ: `gcloud builds submit --config=deploy/threads-research-views/cloudbuild.yaml --project=mark-454114 .`
- 画面上の数字は丸め（2.8万=27,500〜28,499）。1万以上は千の位まで
