# 売上への顧客ID補完

金額・決済日・入金日・カテゴリ・手動入力・分割・グループは既存の売上テーブルを正とする。
`autostudio_sales.sales_customer_links` は `charge:<id>` / `manual:<id>` ごとの顧客属性だけを保存する。売上を追加しない。

## 参照元と照合

- エルメ回答シート `1kK2EKZ2YyjCwpmBbVFvIwZswZkGNpFrAAwejeLm2Kzo`：回答者IDはエルメID。LINEユーザーIDとは別に保存。
- Guardian顧客管理シート `1LXrPBtbECWx51NQj9KrOBZFu5IOOIQluI2wmhS1_FyI`：フロント・バックの確認済みID列。列位置ではなくヘッダー名で読む。
- `autostudio_lstep.user_payment_methods`：LステップIDで参照。3タグ完備・分類済み・3日以内の更新分のみ支払方法の参考情報として表示する。実決済と異なれば相違を表示し、元の支払方法は維持。

決済トークンから取得したメールの完全一致、または保存済みのエルメIDから照合する。同じメールの複数回答者、ID体系間の複数候補は保留する。銀行振込やバック単独購入は、既存の顧客別名・契約日と金額・注文やグループ・シートのIDセルの確認メモを照合した取引ごとのレビューを利用できる。氏名だけでは確定しない。エルメIDがない場合もLステップIDのみで連携可能。エルメ登録日（シート上の運用購入日）は実決済日とは別に保持。

ダッシュボードは保存済み対応表を読み、支払タグだけをDBから最新化する。メインの取引一覧および講座の購入者一覧で「顧客ID」を開くと、ID・登録日・照合日時・出典・保留理由を確認できる。

対応表には売上種別・売上ID・共通顧客キー（`lstep:<ID>`、未確認なら `elme:<ID>`）を保存する。購入者集計は確認済みIDを使ってフロント・バックを関連づけるが、売上明細・既存グループ・分割は残す。既存プロフィールの更新先キーも維持する。

## 取り込み手順

GuardianシートはAutoStudioサービスアカウントに共有されていない。共有範囲を変更せず、認可済みのGoogle Drive接続から取得した `values` JSONを使う。次のファイルをGit管理外の監査ディレクトリへ保存する。

- `guardianFront.json`：`Threads×AIマスター講座メンバーリスト` の全使用行、A:AW
- `guardianBack.json`：`SNSマーケ講座メンバーリスト` の全使用行、A:BD
- `guardianNotes.json`（契約照合時）：Google Sheets CellDataの `formattedValue,note`。フロントAU列・バックBB列のIDセルのメモ。
- `reviewed-sales-links.json`（契約照合時）：`ReviewedSalesIdentity[]`。売上キー・シート行URL・LステップID・既存顧客キー・確認根拠と、照合時の金額/日付/カテゴリ/元の顧客名を保存する。取り込み時に現物との完全一致を検査する。

```sh
node --env-file=.env.local --import tsx src/scripts/reconcileSalesCustomerIds.ts <監査ディレクトリ>
```

`customer-link-preview.json` の対応・保留理由・集計を確認してから、同じコマンドに `--apply` を付けて取り込む。入力JSON・出力・決済連絡先キャッシュは顧客情報を含むためコミットしない。再取り込み前にはシートのエクスポートを更新し、`customer-link-contacts.json` を必要に応じて更新する。

保存済みIDは上書きせず空欄のみ補完。競合時は既存IDを保ち要確認にする。同時更新時は更新前のpayloadが一致した行だけ保存し、読み戻し不一致で失敗する。

処理前後に7つの元テーブルの全行ハッシュ・件数を比較する。決済成功分と分割展開後の手動売上について、カテゴリ別・売上日別・入金日別集計も監査JSONに保存する。既存取引の読み取り専用プレビューが成功してから対応表を書き、読み戻しと元テーブル不変を確認する。

これは既存売上へのID取り込み。GuardianシートのID追加を自動同期するジョブは含まない。シート更新後は再プレビュー・取り込みが必要。
