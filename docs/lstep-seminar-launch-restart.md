# LSTEP セミナー日時更新の再開手順

Cloud Scheduler `autostudio-lstep-seminar` は停止したままにする。新しいローンチを再開するときは、LSTEPで新しい素材をすべて作成した後、この順番で進める。

## 1. 設定ファイルを作る

`deploy/lstep-seminar/launch-config.paused.json` をコピーし、次だけを新しい素材へ差し替える。

- `launchId`: ローンチを一意に識別する名前
- `window.startDate` / `window.endDate`: 自動更新を許可する期間
- `reminder.prefix`: 例 `【2026.9】`
- `targets.tagGroupName`: 日程タグを置くタググループ名
- `targets.form.id` / `groupId` / `choiceSelector`
- `targets.dateTemplateId`
- `targets.reminderTemplate.id` / `groupId`
- `targets.flexTemplates`: 各FlexテンプレートのID、表示名、枠数、明日起点かどうか
- `targets.oneTapTagId`
- 必要なら `counts`、`schedule.slotHours`、`reminder.goalTime`
- `immutableActionPrefix`: ローンチごとに重複しない値

編集が終わるまで `enabled` は `false`、`window` は `null` のままにする。素材と期間が確定したら `window` を入れ、`enabled` を `true` にする。

## 2. 再開前チェック

```sh
npx tsx src/scripts/manageLstepSeminarLaunch.ts validate --config /path/to/new-launch.json
npm run lstep:seminar -- --config /path/to/new-launch.json --preview
npx tsx src/scripts/manageLstepSeminarLaunch.ts publish --config /path/to/new-launch.json
```

1つ目は必須項目、日付、開催時刻と実行時刻の対応を検証する。2つ目はLSTEPを変更せず、全遷移先と変更予定を読む。3つ目はGCSの保存先を表示するだけで、まだ書き込まない。

## 3. 反映して再開する

プレビューに問題がないことを確認してから実施する。

```sh
npx tsx src/scripts/manageLstepSeminarLaunch.ts publish --config /path/to/new-launch.json --apply
gcloud run jobs execute autostudio-lstep-seminar --region asia-northeast1 --project mark-454114 --wait
gcloud scheduler jobs resume autostudio-lstep-seminar --location asia-northeast1 --project mark-454114
```

手動実行でLSTEPの各画面が更新・再読込検証済みになったことを確認してから、最後にSchedulerを再開する。Schedulerは毎日12時・20時（JST）の設定を保持している。

開催時刻を13時・21時以外へ変えた場合だけ、検証結果に出る `scheduler cron` と同じ時刻へSchedulerも更新してから再開する。

```sh
gcloud scheduler jobs update http autostudio-lstep-seminar --schedule='0 <runHoursをカンマ区切り> * * *' --time-zone=Asia/Tokyo --location=asia-northeast1 --project=mark-454114
```

## 安全装置

- Schedulerを再開しても、`enabled=false` ならブラウザを開かず何も変更しない。
- `window` の開始前・終了後も同様に何も変更しない。
- 設定はジョブ実行ごとにGCSから読むため、IDや期間の変更だけなら再ビルドは不要。
- dry-runの `--preview` だけは停止中・期間外でも画面を検査できる。LSTEPへの保存はしない。
