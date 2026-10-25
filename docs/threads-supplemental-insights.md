# Threads追加インサイト: Drive CSV連携

2026-10-24、HTTP送信からDriveフォルダ読み取りへ変更。受信APIと専用APIキーを廃止。
フォルダ: https://drive.google.com/drive/folders/1hRfvcpd3kMkAdSmNFyPD-dpX1Sf_QCHS
保存先: `mark-454114.autostudio_threads.threads_post_insights_snapshot`、リージョン `asia-northeast1`。

## データ契約

- 本人kudooo_aiの親投稿・登録済み本人返信を照合する。未知の投稿や親子関係は推測して作らない。
- ファイル名は `threads_post_insights_YYYY-MM-DD.csv`。旧top30とsampleは自動取り込み対象外。
- UTF-8、BOMと引用符内改行対応。1ファイル20MiB以内、1レコード1MiB以内。
- 全行のsnapshot_date、snapshot_atのJST日付、ファイル名の日付が一致すること。
- parent_post_idはツリー先頭投稿ID。親自身は空欄。is_self_replyはtrue/false、両列空欄は未分類（null）であり親投稿ではない。未分類は既存DBの一意な本人投稿・返信との照合でのみ分類できる。IDは文字列として扱い、科学表記を拒否する。
- 全11指標を保持。空欄/nullは欠測、実測0は0。snapshot_atは実際の取得日時。posted_at不明時は空欄可。
- caption、posted_at、CSVの親子区分、DriveファイルID・名前・versionをpayload_jsonに保持する。DB照合結果はroot_post_idとnode_typeへ保存し、既存本文は上書きしない。
- 前後のversionとMD5で読み取り中の変更を検知する。同名の日次ファイルが複数ある場合も停止する。
- ファイル全行の形式・ID・親子関係の照合後、100行ごとに逐次保存。並列起動は禁止。途中保存失敗では成功バッチが残るため、原因を直して同じファイルを再実行する。
- source/account/post/dateでMERGE。再送は加算しない。新しい取得時刻だけ指標を更新、古い観測は無視。同時刻で値が違う場合は拒否。同時刻・同じ数値で分類・出典だけ更新された場合は、照合済みの分類とpayloadを更新する。
- CSV30件は実取得日時が不明で未投入。新サンプル4件は既存保存値と一致、合計follows=38。
- Drive原本の変更・移動・削除はしない。

## 実行

既存のGOOGLE_SERVICE_ACCOUNT_JSON（JSON/base64）、GOOGLE_APPLICATION_CREDENTIALS、または実行環境ADCを利用。
Driveはdrive.readonlyスコープ。BigQueryは既存設定。新しい受信キーは不要。
表示用THREADS_SUPPLEMENTAL_INSIGHTS_ENABLED=trueは継続する。

```sh
# デフォルト検証のみ、日次ファイルを全件検出
npx tsx src/scripts/importThreadsInsightsFromDrive.ts
# 指定日の検証・保存
npx tsx src/scripts/importThreadsInsightsFromDrive.ts --date 2026-10-24
npx tsx src/scripts/importThreadsInsightsFromDrive.ts --date 2026-10-24 --write
# サンプルは明示指定時のみ
npx tsx src/scripts/importThreadsInsightsFromDrive.ts --file-id 1u--FnKysa2BPwuPOMwleMLJ37QI9U6I4
# コネクタで取得したファイルも同じ照合
npx tsx src/scripts/importThreadsInsightsFromDrive.ts --csv PATH
# 照合できる行だけを明示的に取り込み、保留IDと理由を保存
npx tsx src/scripts/importThreadsInsightsFromDrive.ts --file-id FILE_ID --allow-unmatched --report REPORT_JSON --write
```

ファイルなしは未取得として異常終了し、0件成功にしない。

## 開始条件・運用案

2026-10-24、ユーザー承認により専用フォルダへ
autostudio@mark-454114.iam.gserviceaccount.comのreader権限を追加済み。
同アカウントでフォルダとサンプルを読み、4件を照合済み。
2026-10-25に分類済み446件（親248・返信198）を全件照合・保存済み。前回保留の2件も解消。
デフォルトでは1件でも照合できなければファイルを書き込まない。部分取り込みは--allow-unmatchedと--reportを必須にして、保留を成功件数へ含めない。

1. 実行用アカウントでサンプル読み取り・照合・再送・読み戻しを確認。
2. 過去90日以内の親投稿＋本人連続返信の全件CSVを1回配置し、対象ID一覧と照合する。
3. 実行環境と定期ジョブを設定し、手動実行でDrive→BigQuery→画面を確認。
4. 2026-10-25の一貫した取り込み・表示対応依頼に合わせ、専用Cloud Run Jobと毎時15分（JST）のDrive取り込みを設定する。Meta AI側の取得予約とは別。運用手順は `deploy/threads-drive-import/README.md`。

成功済みfile ID/versionは取り込み記録でスキップする。二重起動はBigQueryのリースで排他する。未照合・失敗ファイルには成功記録を付けず、修正後に再実行できる。

90日は対象の投稿日範囲。過去90日分の観測履歴を創作する意味ではない。
対象親投稿にぶら下がる本人連続返信は投稿日を問わず含める。他人の返信とそれへの返答は含めない。
取得が日付をまたぐときは実取得日ごとのファイルに分け、翌日配置でも実取得日の名前を維持する。
429などの欠測は0埋めせず報告する。アカウント全体インサイトは今回不要。

## 表示・検証

全11指標と出典・取得日時はDBで保持。画面は閲覧数→リーチ→プロフィール訪問→フォロー転換率→フォロー獲得に絞り、親投稿と本人返信で同じ順序にする。取得日時・出典ラベル・取得件数は画面に表示しない。
一覧の訪問・フォローはツリーの取得済み数値の単純合計。アカウント純増・ユニーク人数ではない。「取得済み分」の注記は表示しない。転換率は同一投稿集合でフォローと訪問が揃えば部分取得でも計算できる。集合不一致・未取得・訪問0件は数値を作らず理由を示す。並べ替えと順位は表示中の数値を使い、部分取得でも値があれば対象にする。未取得・算出不可は末尾に置き、順位を付けない。
日次差分表示は未実装。欠測日を挟む差分を1日分と扱わない。

```sh
npx tsx --test src/lib/threadsDriveCsv.test.ts src/lib/threadsSupplementalMetrics.test.ts
npm run typecheck
npm run build
```
