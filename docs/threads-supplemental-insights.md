# Threads 投稿別追加インサイト

## 現在の状態（2026-10-24）

- AutoStudioの既存投稿と、Muse提供CSVの30件を読み取り専用で照合済み。URL・本文・JST投稿日が全件一致。アカウントは全件 `main` / `kudooo_ai`。
- CSV合計は views=372839、profile_visits=18321、follows=201。既存API値とは取得時刻や定義の違いを未確認のため、既存値は置き換えない。
- 受信API、BigQuery保存処理、トップコンテンツ表示・並べ替えをローカル実装。
- 型チェック、ビルド、入力・認証・ツリー照合テスト10件を通過。BigQueryの一時テーブルで再送、古い値の再送、同時刻の矛盾、NULL/0、JST日付、日別履歴を検証済み。
- ユーザーの取り込み指示を受け、本番テーブルを作成して親投稿1件・本人返信3件を保存済み。再送後も4行・フォロー合計38のまま。各返信の全11指標と取得日時も読み戻し済み。
- 表示の本番反映を進める段階。外部送信用キーと日次予約は未設定。全投稿分の追加ファイルは未受領のため、全件取り込み済みとは扱わない。
- 「Muse」は引き継ぎ資料内の呼称。ユーザーによると取得元はMeta AIのアプリ内。Meta AIからの回答をユーザー経由で受領し、定期実行・認証ヘッダー付きHTTP送信・Drive自動保存が可能との回答あり。実動作は未検証。
- 1投稿の再取得結果（2026-10-24 17:52:05.244 JST）を受領。投稿ID `18118522570981616` とURLは既存投稿に一致。follows=27、profile_visits=1660。テスト用リクエストを `output/threads-muse-2026-10-24/connection-test.json` に保存。
- 当該投稿の閲覧内訳は860+33759=34619で、総閲覧34641と22差がある。元の値を保持し、不明分を配分・補正しない。差の理由は未確認。投稿IDの一致や同値の再報告だけで数値の正確性を独立検証したとは扱わない。
- 本人返信3件の取得結果もユーザー経由で受領。`tree-import.json` に元の数値と各取得日時を保存。既存の `threads_comments` で本人アカウントと親投稿を照合し、`root_post_id` と `node_type` を解決する。取得元の `post_type: POST` はツリー分類に使わない。

## 連携先への回答

1. 保存先：`mark-454114.autostudio_threads.threads_post_insights_snapshot` を新規追加。データセットのリージョンは実確認で `asia-northeast1`。
2. AutoStudioの既存Next.js APIを受け口にする。Meta AIの回答に基づきHTTP POST方式を第一候補として接続テストする。別のCloud Runサービスは初期段階では追加しない。実際にHTTP送信できない場合はDrive経由の取り込みを別途作る。
3. 投稿・本人返信ごとの累計をJST日付ごとに保存。取得日時、受信日時、取得元、アカウント、投稿ID、親投稿ID、親投稿/返信の区分、元の受信値も保存する。未取得の指標はNULL。
4. 当初は本人アカウントの直近30日分、1日1回。1リクエスト100投稿以内で逐次送信。上位30件のCSVは初期サンプルであり、今後も上位30件だけを取得する設計ではない。
5. アカウント全体の別テーブルは今回対象外。
6. 予定URLは `https://asto.jp/api/threads/insights/import`（未デプロイ）。認証ヘッダー `x-threads-insights-key`。同じ取得日の新しい観測で更新し、過去の日付は履歴として保持。再送は加算しない。

## API仕様

`POST /api/threads/insights/import`

- `Content-Type: application/json`
- `x-threads-insights-key: <専用キー>`
- 本番有効化には `THREADS_SUPPLEMENTAL_INSIGHTS_ENABLED=true` と `THREADS_INSIGHTS_INGEST_KEY`（32文字以上のランダム値）が必要。未設定は503、認証不一致は401。
- 本文上限256KiB、1〜100行。`source` と `account_username` は下記の値だけを受け付ける。
- キーは安全なシークレット入力経路で設定し、チャット・URL・ログには記載しない。

以下は形式例。数値と時刻はテスト値であり、そのまま本番投入しない。

```json
{
  "source": "muse_threads",
  "account_username": "kudooo_ai",
  "snapshots": [
    {
      "snapshot_at": "2026-10-24T17:00:00+09:00",
      "post_url": "https://www.threads.com/@kudooo_ai/post/DeOpK-YERN9",
      "follows": 27,
      "profile_visits": 1660,
      "views": 34641
    }
  ]
}
```

- `snapshot_at` は元データを取得した実時刻。タイムゾーン必須。送信時刻・投稿日・CSV作成時刻で代用しない。JST日付は受け口で算出する。
- `post_id` は省略可能。URLを既存の本人投稿に照合して数値IDを解決する。指定したIDと照合結果が異なる場合や未登録投稿は、バッチ全体を400で拒否する。URL内のshortcodeを数値IDとして渡さない。
- 本人返信も同じリクエスト形式を使う。`threads_comments` の登録済み本人返信と、その親投稿を照合する。他人のコメントや不明な親子関係を推測して追加しない。
- `follows` または `profile_visits` の少なくとも一方に実測値が必要。欠測は省略かnull、実測0は0。
- 他に `reach`, `likes`, `replies`, `reposts`, `quotes`, `shares`, `views_from_followers`, `views_from_non_followers` を受け付ける。未取得値を補間しない。
- 正常時200で受け付け件数と保存結果を返す。古い観測の再送は、より新しい保存済みの値を返す。
- 同一取得時刻で値が異なる場合は書き込みを拒否する。実取得日時や取得結果を訂正する必要があり、時刻を偽って回避しない。
- 同一アカウントの異なるバッチは並列送信せず、成功応答後に次を送る。500やタイムアウトでは同じペイロードを再送し、400では内容や投稿同期を修正する。自動で無限再試行しない。
- 取得元で429になった際の再開方法はMeta AI側の機能確認後に決める。取得できなかった投稿は送らず、0で埋めない。

## 表示と集計

既存の投稿一覧APIが最新の追加指標を投稿IDで結合する。公式API由来の閲覧数やいいね数を上書きしない。

- トップコンテンツでフォロー獲得数、プロフィール訪問数、フォロー転換率と各取得日時を表示。
- 投稿を展開すると、親投稿と本人返信の全指標を表示。親投稿と返信はそれぞれの取得日時を持つ。
- ツリー内フォロー合計は各ノードの単純合計で、アカウント純増やユニーク人数ではない。取得済み件数/登録済み件数を併記。全ノードのフォロー数を取得できたツリーだけを合計順の順位対象にする。
- 転換率は同一観測の `follows / profile_visits * 100`。分母が0または欠測なら表示しない。
- 未取得は順位を付けず並べ替えの末尾へ。サブアカウントは対象外。読み取り障害は未取得と別に表示する。
- 選択期間は投稿日の絞り込み。追加指標は各投稿の最新取得時点の累計であり、選択期間内の獲得数ではない。
- 日次増分表示は今回未実装。将来は連続した観測間の差分として計算し、欠測を挟む差分や数値の訂正を1日分の獲得数にしない。

## 検証コマンド

```sh
npx tsx --test src/lib/threadsSupplementalMetrics.test.ts src/app/api/threads/insights/import/route.test.ts
npm run typecheck
npm run build
npx tsx src/scripts/checkThreadsSupplementalStorage.ts
```

最後のコマンドはBigQueryの一時テーブルだけで保存ロジックを検証する。既存の本番テーブルは変更しない。

## 次の作業

1. Meta AIからの1投稿の取得結果と機能可否回答は受領済み。HTTP送信・定期実行の実動作と、指標の独立照合はまだ未検証。
2. 接続方式を確定し、本番反映の承認後にSQLでテーブルを作成、環境変数を設定して、mainへのcommit/pushによる通常のVercel本番パイプラインを実行する。
3. まず1件を受信してBigQueryと画面を読み戻し、同じデータの再送後も重複しないことを確認する。
4. 今回の再取得時刻が分かるのは1投稿だけ。残り29件へ同じ取得時刻を流用しない。元のCSVの実取得時刻が確認できなければ30件を取得し直す。初期データは取得元を明示し、独立照合前に検証済みと表記しない。
5. 自動実行機能を実証し、ユーザー承認後に1日1回の取得を設定する。定期実行後の実データ反映を確認するまで「自動化済み」としない。

CSV取り込みCLIはデフォルトdry-run。実時刻が確認できるまで実行しない。

```sh
npx tsx src/scripts/importThreadsSupplementalInsights.ts --csv PATH --snapshot-at ACTUAL_ISO_OBSERVATION_TIME --output OUTPUT_JSON
```

`--write` を明示したときだけ書き込む。元のCSVに行ごとの `snapshot_at` があれば、その値を優先する。
