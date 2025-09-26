# YouTube Analytics OAuth 設定手順

## 1. Google Cloud Console でOAuth 2.0 クライアントIDを作成

### Step 1: Google Cloud Console にアクセス
1. https://console.cloud.google.com/ にアクセス
2. プロジェクト `mark-454114` を選択

### Step 2: OAuth同意画面を設定
1. 左メニューから「APIとサービス」→「OAuth同意画面」
2. User Type: 「内部」または「外部」を選択
3. アプリ情報を入力:
   - アプリ名: `AutoStudio`
   - ユーザーサポートメール: `dodo.inc.kudo@gmail.com`
   - 承認済みドメイン: `localhost` (開発用)
   - デベロッパーの連絡先情報: `dodo.inc.kudo@gmail.com`

### Step 3: スコープを追加
1. 「スコープ」タブで「スコープを追加または削除」
2. 以下のスコープを追加:
   - `https://www.googleapis.com/auth/youtube.readonly`
   - `https://www.googleapis.com/auth/yt-analytics.readonly`

### Step 4: OAuth 2.0 クライアントIDを作成
1. 左メニューから「APIとサービス」→「認証情報」
2. 「認証情報を作成」→「OAuth 2.0 クライアントID」
3. アプリケーションの種類: 「ウェブアプリケーション」
4. 名前: `AutoStudio YouTube Analytics`
5. 承認済みのリダイレクトURI:
   - 開発環境: `http://localhost:3000/api/youtube/oauth/callback`
   - 本番環境: `https://your-domain.com/api/youtube/oauth/callback`

### Step 5: 認証情報をダウンロード
1. 作成されたクライアントIDの詳細ページで「JSONをダウンロード」
2. ファイルから `client_id` と `client_secret` をコピー

## 2. 環境変数を設定

`.env.local` に以下を追加:

```env
# YouTube Analytics OAuth
YOUTUBE_OAUTH_CLIENT_ID=your_client_id_here
YOUTUBE_OAUTH_CLIENT_SECRET=your_client_secret_here
YOUTUBE_OAUTH_REDIRECT_URI=http://localhost:3000/api/youtube/oauth/callback
```

## 3. OAuth認証を実行

1. http://localhost:3000/youtube にアクセス
2. 「YouTube Analytics (詳細データ)」セクションで「YouTube と連携する」をクリック
3. Google認証画面でアクセスを許可
4. コンソールに出力されるリフレッシュトークンをコピー
5. `.env.local` に追加:

```env
YOUTUBE_OAUTH_REFRESH_TOKEN=your_refresh_token_here
```

## 4. 動作確認

1. サーバーを再起動: `npm run dev`
2. http://localhost:3000/youtube にアクセス
3. YouTube Analytics セクションに詳細データが表示されることを確認

## 取得できるデータ

- **基本メトリクス**: 視聴回数、視聴時間、登録者増減
- **視聴者属性**: 年齢層、性別、地域別データ
- **トラフィックソース**: 流入元分析
- **収益データ**: 推定収益、CPM、RPM（有効な場合）

## 注意事項

- リフレッシュトークンは長期間有効ですが、定期的に更新が必要な場合があります
- 収益データは一定の条件を満たしたチャンネルのみ取得可能です
- OAuth認証は初回のみ必要で、以降はリフレッシュトークンで自動認証されます