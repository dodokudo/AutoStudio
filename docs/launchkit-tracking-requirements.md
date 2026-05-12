# LaunchKit x AutoStudio 計測基盤 要件定義

## 目的

LaunchKitで新しく作成するLPについて、AutoStudio側でLP閲覧・LINE CTAクリック・LINE登録数を一貫して見られるようにする。

既存のAutoStudio短縮URL運用は壊さず、新規LPからは短縮URL作成の手間を減らす。

## 現状

AutoStudioには既に短縮URL計測がある。

- `category=threads / instagram / ad / note`
  - SNS・広告・noteなどからLPへ送る入口リンク
- `category=line`
  - LP内のLINE CTAボタンからLステップへ送るリンク
- クリックログ
  - `autostudio_links.click_logs`
- リンク定義
  - `autostudio_links.short_links`
- LINE登録数
  - Lステップ側データから集計

LaunchKitの既存LPには、LP内CTAとして `https://autostudio-self.vercel.app/l/L-opt4` や `TAI2` などの短縮URLが埋め込まれている。

## 方針

既存LP・既存短縮URLは変更しない。

新規LPだけ、LaunchKitとAutoStudioの新しい計測方式を使う。

新規LPでは以下を計測する。

1. LP閲覧数
2. LINE CTAクリック数
3. LINE登録数

ファネルは以下の形にする。

```text
LP閲覧
  ↓
LINE CTAクリック
  ↓
LINE登録
```

## 非対象

今回やらないこと。

- 既存LP内のLINE CTA短縮URLの置き換え
- 既存 `short_links` / `click_logs` の削除や再集計
- 既存投稿・既存広告のURL差し替え
- Lステップの登録取得ロジックの大幅変更

## 新規運用イメージ

AutoStudioに「LaunchKit LP管理画面」を作る。

管理画面で以下を登録する。

- LP名
- LaunchKit URL
- LP slug
- ジャンル
  - オプト
  - セミナー
  - 個別相談
  - その他
- 流入元
  - Threads
  - Instagram
  - Meta広告
  - note
  - YouTube
  - その他
- LINE CTA URL
  - Lステップの直リンクでよい
- 有効 / 無効

登録後、新規LPにLaunchKit共通JSを入れる。

LP表示時にAutoStudioへ `page_view` を送信する。

LINE CTAクリック時にAutoStudioへ `line_cta_click` を送信し、その後LステップURLへ遷移する。

## 既存運用との互換性

既存の短縮URLはそのまま動かす。

例:

```text
https://autostudio-self.vercel.app/l/3mtp
https://autostudio-self.vercel.app/l/L-opt4
```

これらは既存通り `short_links` と `click_logs` で集計する。

新規LPの計測は、既存テーブルを無理に流用してもよいが、イベント種別が必要になるため、可能なら新規テーブルを作る。

推奨は新規テーブル方式。

## 推奨データ設計

### `launchkit_lps`

LaunchKit LPの管理テーブル。

| column | type | memo |
| --- | --- | --- |
| id | STRING | UUID |
| name | STRING | LP名 |
| slug | STRING | LaunchKit slug |
| url | STRING | 公開URL |
| genre | STRING | opt / seminar / consult / other |
| source | STRING | threads / instagram / ad / note / youtube / other |
| line_cta_url | STRING | Lステップ直リンク |
| is_active | BOOL | 有効状態 |
| created_at | TIMESTAMP | 作成日時 |
| updated_at | TIMESTAMP | 更新日時 |

### `launchkit_events`

LP閲覧・CTAクリックのイベントログ。

| column | type | memo |
| --- | --- | --- |
| id | STRING | UUID |
| lp_id | STRING | `launchkit_lps.id` |
| event_type | STRING | page_view / line_cta_click |
| occurred_at | TIMESTAMP | 発生日時 |
| referrer | STRING | referer |
| user_agent | STRING | UA |
| ip_address | STRING | IP |
| device_type | STRING | desktop / mobile / tablet / unknown |
| url | STRING | 発生ページURL |
| source | STRING | LP定義からコピー |
| genre | STRING | LP定義からコピー |
| utm_source | STRING | 任意 |
| utm_medium | STRING | 任意 |
| utm_campaign | STRING | 任意 |
| fbclid | STRING | 任意 |

## AutoStudio API要件

### LP管理API

```text
GET /api/launchkit/lps
POST /api/launchkit/lps
PATCH /api/launchkit/lps/:id
DELETE /api/launchkit/lps/:id
```

### 計測API

```text
POST /api/launchkit/events
```

request body:

```json
{
  "lpId": "uuid",
  "eventType": "page_view",
  "url": "https://lkit.jp/opt-5",
  "utm": {
    "source": "threads",
    "medium": "profile",
    "campaign": "2026-05-opt"
  },
  "fbclid": "optional"
}
```

`eventType` は以下のみ許可。

- `page_view`
- `line_cta_click`

CORSは以下を許可する。

- `https://lkit.jp`
- `https://www.lkit.jp`
- LaunchKit preview URL
- localhost development URL

## LaunchKit JS要件

新規LPに共通JSを読み込ませる。

例:

```html
<script src="/assets/js/launchkit-tracking.js" defer></script>
```

LPごとに以下の設定をHTMLに埋める。

```html
<script>
  window.LAUNCHKIT_TRACKING = {
    lpId: "uuid",
    apiBase: "https://autostudio-self.vercel.app"
  };
</script>
```

JSの動作:

1. ページロード時に `page_view` を送る
2. `data-launchkit-line-cta` が付いたリンククリック時に `line_cta_click` を送る
3. イベント送信後、または短いタイムアウト後に本来のLINE URLへ遷移する
4. 計測APIが失敗してもユーザー遷移を止めない

CTA例:

```html
<a
  href="https://liff.line.me/..."
  data-launchkit-line-cta
>
  LINE登録はこちら
</a>
```

## AutoStudio UI要件

AutoStudioに「LaunchKit LP管理」画面を追加する。

最低限必要な機能:

- LP一覧
- LP新規作成
- LP編集
- LP無効化
- 計測用JS設定の表示
- 公開URLコピー
- LINE CTA URL登録
- ジャンル・流入元の選択

ダッシュボードでは以下を表示する。

- LP別
  - LP閲覧数
  - LINE CTAクリック数
  - CTA率
  - LINE登録数
  - 登録率
- ジャンル別
  - オプト / セミナー / 個別相談ごとの集計
- 流入元別
  - Threads / Instagram / 広告などの集計

## LINE登録数との紐付け

初期実装では、Lステップ側の既存登録データを `source` またはタグで集計する。

LP単位で厳密に登録数を見たい場合は、LステップURL側にLP識別用パラメータを渡す必要がある。

例:

```text
https://liff.line.me/...&lk_lp=opt-5&lk_source=threads
```

Lステップ側でこのパラメータが友だち属性や流入経路として残せるかは別途確認する。

残せる場合、AutoStudio側でLP別の登録数まで正確に出せる。

残せない場合、初期版では流入元・期間ベースの登録数として扱う。

## 実装順序

1. AutoStudioにBigQueryテーブル作成処理を追加
2. AutoStudioにLP管理APIを追加
3. AutoStudioに計測APIを追加
4. AutoStudioにLP管理画面を追加
5. LaunchKitに共通計測JSを追加
6. 新規LPテンプレートに計測設定とCTA属性を入れる
7. テストLPで以下を検証
   - LP閲覧が記録される
   - LINE CTAクリックが記録される
   - CTAクリック後にLINEへ遷移する
   - 既存短縮URLが変わらず動く

## 受け入れ条件

- 既存の `/l/:code` 短縮URLが今まで通り動く
- 既存LP内のLINE CTA短縮URLを変更しない
- 新規LaunchKit LPでLP閲覧がAutoStudioに記録される
- 新規LaunchKit LPでLINE CTAクリックがAutoStudioに記録される
- 計測API失敗時もLINE遷移を止めない
- AutoStudio管理画面でジャンル・流入元ごとに集計できる
- 新規LP作成時に、毎回AutoStudio短縮URLを作らなくてもLINE CTAクリックを計測できる

## 注意点

新規LPでは短縮URLを使わずに計測できるが、既存LPはそのまま維持する。

過去データと新規データを同じ画面で見る場合は、既存 `short_links/click_logs` と新規 `launchkit_events` を統合表示する必要がある。

最初から完全統合しなくてもよいが、最終的には「既存リンク計測」と「新規LaunchKit計測」を同じファネル画面で見られるようにする。
