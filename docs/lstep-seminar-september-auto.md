# 2026.9オート 日時更新の引き継ぎ

## 実行と通知

- 設定原本: `deploy/lstep-seminar/launch-config.september-auto.json`
- 本番設定: `gs://lstep-data-bucket/lstep/config/seminar-launch.json`
- Cloud Run / Scheduler: `autostudio-lstep-seminar`（project `mark-454114`、region `asia-northeast1`）
- 毎日 **09:00 / 12:00 / 19:00 JST** に開催1時間前の枠を締め切り、次の枠へ繰り上げる。開催は10:00 / 13:00 / 20:00。
- 2026-09-11から、終了日を設けず継続。停止はSchedulerをpauseし、設定の`enabled=false`をpublishする。
- 実行結果は既存の `LSTEP_SEMINAR_REPORT_TARGET_ID` へLINE送信。成功・失敗を通知し、同一Cloud Run実行の通知再送だけを再送キーで抑止する。通知APIエラーはジョブを失敗にする。
- CSVダウンロードの `autostudio-lstep-daily` / `autostudio-lstep` とは別のジョブ。

## 更新する対象

|対象|ID|保持枠数|
|---|---|---:|
|セミナー申込フォーム|1123267 / group 222026 / `#radio_3`|最大24（8日間）|
|2日後07:08 ワンタップ|280521249|6|
|2日後21:03 ワンタップ|280520841|6|
|4日後06:58 ワンタップ|280520721|6|
|4日後23:00 ワンタップ|280520632|6|
|セミナー日程選択用|280521839|7|
|リマインド開始10分後 本文の日程|280160552 / group 1051991|15|

フォームは2026-09-11の依頼で、最初の申込可能日から8日間（9/12〜9/19を両端含む）、各日10時・13時・20時へ拡張した。開催1時間前の締切で当日の枠は減り、当日の全枠終了後に表示期間が翌日へ移る。その他の素材の枠数は維持する。日程以外の本文、URL、残席表示、配信時刻は今回の更新対象にしない。7月版の6〜8日後素材は9月シナリオに存在せず、参照しない。

## タグ・リマインダ

- 日程タグフォルダ: `【2026.9オート】セミナー日程`（742813）。名前は `【2026.9オート】9/12(土)10:00~` の形式。
- 新しい日程タグは同じ時間帯の既存タグから複製し、申込日とリマインダのゴール日付を更新。既存の過去日程タグを削除しない。
- ゴール時刻は既存通り、開催日の **22:00**。開催時刻そのものではない。
- リマインダ: 10時=1798502、13時=1798496、20時=1798476。
- 時間帯タグ: 10時=10475319、13時=10475320、20時=10475321。
- ワンタップ申込タグ:10463640、申込総数:10463642。友だち情報の申込日:2784886。
- フォームは表示日程だけでなく、日付タグ・時間帯タグ・申込日の代入値を同時に合わせる。条件は保持する。
- Flexは期限切れボタンを除外し、新しい日程には新しいブロックIDのボタンとアクションを作成する。有効な既存日程のボタンIDは保持し、一回の保存で切り替える。保存後はボタンIDとアクションIDの両方を検証する。送信済みボタンが参照する旧アクションは変更しない。
- アクション名は `AUTO_2026_09_<素材ID>_<YYYY-MM-DD>_<時刻>`。素材ごとの確認メッセージの差を維持するため、素材をまたいでアクションを共用しない。
- タグ一覧の説明は名称変更前の表示が残る場合がある。異常判定時はタグ詳細の現在の参照を確認する。

## 実行前確認と反映

```sh
npx tsx src/scripts/manageLstepSeminarLaunch.ts validate --config deploy/lstep-seminar/launch-config.september-auto.json
npm run lstep:seminar -- --config deploy/lstep-seminar/launch-config.september-auto.json --preview
npx tsx src/scripts/manageLstepSeminarLaunch.ts publish --config deploy/lstep-seminar/launch-config.september-auto.json --apply
```

初回検証は `--prepare-next-slot` を追加すると、表示枠数を増やさず翌回分のタグ作成まで確認できる。`--preview` は保存も通知もしない。

プログラム変更時は対象ファイルだけをmainへcommit/pushし、そのcommitのクリーンなソースからCloud Run用イメージを作る。ジョブの既存env・secretを保持してimageのみ更新する。設定のpublishだけではコードは更新されない。

手動実行成功、LINE API受付、LSTEP各対象の保存後再読込を確認してからSchedulerを有効化する。Cloud Run成功だけで設定完了としない。実行証跡は `output/september-seminar-automation/`。

## 継続して監視すること

LSTEP側の画面変更、ログイン切れ、LINE通知APIエラーは実行失敗の原因になる。通知失敗はLINE自身では通知できないため、Cloud Runの実行結果も確認する。残席数は既存表示を引き継ぐ仕様であり、このジョブが定員を集計しているわけではない。
