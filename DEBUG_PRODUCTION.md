# 本番環境投稿失敗デバッグガイド

## 問題の症状
- ローカル環境では個別投稿が正常に動作（メイン投稿→コメントの順で投稿）
- 本番環境では投稿が失敗する

## 確認すべき環境変数

本番環境で以下の環境変数を確認してください：

```bash
# 必須設定
THREADS_POSTING_ENABLED=true
THREADS_TOKEN=your_threads_access_token
THREADS_BUSINESS_ID=your_business_account_id

# 確認方法（本番環境のログで）
NODE_ENV=production
```

## デバッグ手順

### 1. 本番環境のログを確認
投稿実行時に以下のログが出力されるようになりました：

```
[plans/update] POST request received
[plans/update] Request body: {...}
[plans/update] Environment check: {...}
[threadsApi] postThread called: {...}
```

### 2. よくある問題パターン

#### パターン1: THREADS_POSTING_ENABLED=false
```
[threadsApi] Skipping Threads publish (dry-run)
```
→ 本番環境で `THREADS_POSTING_ENABLED=true` に設定

#### パターン2: 認証情報不足
```
[threadsApi] Credential check failed: {...}
```
→ `THREADS_TOKEN` と `THREADS_BUSINESS_ID` を設定

#### パターン3: ネットワーク/API エラー
```
[plans/update] Threads posting error: {...}
```
→ エラー詳細から具体的な問題を特定

## 改善されたログ出力

### 環境情報の詳細ログ
- 環境変数の設定状況
- 認証情報の有無（実際の値は隠蔽）
- リクエストパラメータの詳細

### エラー情報の詳細ログ
- エラーの種類と詳細メッセージ
- スタックトレース
- 環境設定の診断情報

## トラブルシューティング

1. **投稿が全く実行されない場合**
   - `THREADS_POSTING_ENABLED=true` を確認
   - ログに `dry-run` と表示されていないか確認

2. **認証エラーの場合**
   - Threads API トークンの有効期限を確認
   - ビジネスアカウントIDが正しいか確認

3. **API エラーの場合**
   - Threads API の利用制限に引っかかっていないか確認
   - 投稿内容が Threads のポリシーに準拠しているか確認

## 次回投稿時の確認ポイント

1. 本番環境のログを確認
2. エラーがあれば詳細情報をもとに対処
3. 必要に応じて環境変数を再設定