# AutoStudio Launch Dashboard - 配信データ表示フロー調査

## 全体フロー
1. **サーバー側（page.tsx）**:
   - `fetchFunnelData()`: BigQuery `marketing.funnels` テーブルから JSON blob として funnel データを取得
   - `fetchBroadcastMetrics()`: BigQuery `autostudio_lstep.broadcast_metrics` から配信メトリクス取得
   - `fetchTagMetrics()`: BigQuery `autostudio_lstep.tag_metrics` からタグ友だち数取得

2. **クライアント側（LaunchDetailClient.tsx）**:
   - `matchDeliveriesWithMetrics()` で delivery と metrics を紐付け
     - Pass 1: `delivery.lstepBroadcastId` による直接マッチング（最優先）
     - Pass 2: 日付ベースのマッチング + トークン類似度による候補選択（LINE配信のみ）
   - `DeliveryWithMetrics[]` 型に変換（latestMetric, timeSeries, clickCount を付加）

3. **表示層**:
   - `DeliveryTimeline`: タイムラインビュー → 配信カード表示 → LineMessagePreview
   - `BroadcastDetail`: 選択された配信の詳細表示 + メトリクスチャート

---

## データ構造

### DeliveryItem（ファネルデータから）
```typescript
{
  id: string;
  date: string;          // YYYY-MM-DD
  time?: string;         // HH:MM
  segmentId: string;
  segmentIds: string[];
  title: string;
  type: 'message' | 'video' | 'sale' | 'reminder' | 'branch';
  messages?: LineMessage[];      // ← LINE UIプレビュー用
  notificationText?: string;     // プッシュ通知テキスト
  clickTag?: string;             // クリック計測タグ名
  lstepBroadcastId?: string;     // ← メトリクス紐付けのキー
  lstepUrlId?: string;
  deliveryTarget?: string;
}
```

### LineMessage 型（ファネルビルダーと同一）
```typescript
interface LineMessage {
  id: string;
  type: LineMessageType;  // 'text' | 'image' | 'carousel' | 'flex' | 'richmenu' | 'audio' | 'video'
  text?: string;
  imageUrl?: string;
  columns?: CarouselColumn[];   // carousel 用
  flexTitle?: string;           // flex 旧方式（後方互換）
  flexBody?: string;
  flexImageUrl?: string;
  flexButtons?: FlexButton[];
  flexFooter?: string;
  flexBlocks?: FlexBlock[];      // flex 新方式
  flexHeaderColor?: string;
}
```

### FlexBlock 型（新方式）
```typescript
interface FlexBlock {
  id: string;
  type: 'title' | 'image' | 'text' | 'button' | 'video';
  title?: string;       // title block 用
  subtitle?: string;
  imageUrl?: string;    // image block 用
  html?: string;        // text block 用（リッチテキスト）
  isBoxed?: boolean;
  label?: string;       // button block 用
  action?: FlexButton;
  buttonStyle?: 'filled' | 'outlined';
  buttonColor?: string;
  backgroundColor?: string;
  padding?: 'normal' | 'wide' | 'top-wide' | 'bottom-wide';
}
```

### BroadcastMetric（BigQuery から）
```typescript
{
  broadcast_id: string;
  broadcast_name: string;
  sent_at: string;               // "配信済み\n2026/02/26\n21:03" 形式
  delivery_count: number;
  open_count: number;
  open_rate: number;
  elapsed_minutes: number;
  measured_at: string;           // ISO 8601
}
```

### DeliveryWithMetrics（クライアント側で構築）
```typescript
interface DeliveryWithMetrics extends DeliveryItem {
  latestMetric?: BroadcastMetric;         // 最新のメトリクス
  timeSeries?: BroadcastMetric[];         // 計測時系列
  clickCount?: number;                     // タグ友だち数（from tag_metrics）
}
```

---

## LineMessagePreview コンポーネント

### 表示パス
1. **DeliveryTimeline**: 各配信カードの下部（280px幅、previewZoom スケール適用）
2. **BroadcastDetail**: 詳細表示の左側セクション

### 対応メッセージ型
- **text**: TextBubble → LINE風吹き出し（アイコン + 白背景テキスト）
- **image**: ImageMessage → img タグ（maxWidth: 70%, maxHeight: 180px）
- **carousel**: CarouselMessage → 最初のカードを表示 + "+N枚" インジケータ
- **flex（旧方式）**: 白カード背景でイメージ・タイトル・説明・ボタン表示
- **flex（新方式）**: flexBlocks[] を BlockRenderer で個別レンダリング
  - title: タイトル + サブタイトル
  - image: img タグ（100% width）
  - text: html または content を dangerouslySetInnerHTML で表示
  - button: filled/outlined スタイルで色・ラベル表示
  - video: 黒背景の再生ボタンモック
- **audio**: 再生ボタン + 波形図 + テキスト
- **video**: 黒背景ムービープレイヤーモック
- **richmenu**: グレーセパレータ + テキスト

### ラベル表示（TYPE_LABELS）
- carousel: 「カルーセル」(#3B82F6)
- flex: 「フレックス」(#8B5CF6)
- audio: 「音声」(#F59E0B)
- video: 「動画」(#EF4444)

### 通知テキスト
- 本文以下に 「通知: <notificationText>」 として表示

---

## メトリクス紐付けロジック

###MatchingStrategy
1. **直接マッチング（Pass 1）**:
   - `delivery.lstepBroadcastId` → `broadcast_id` でキーハッシュ検索
   - 最優先度

2. **日付ベース + トークン類似度（Pass 2）**:
   - `delivery.date` → metrics の `sent_at` 日付部分でフィルタ
   - 同じ日付の複数 broadcast から、delivery.title と broadcast_name の トークン類似度で最適候補を選択
   - 類似度スコア < 1 なら match 失敗（ambiguous）
   - LINE配信のみ対象（ig-*, th- プレフィックスは除外）

### クリック数の取得
- `delivery.clickTag` → `tag_metrics` で `tag_name` を検索
- `friend_count` が該当タグの最新友だち数 = クリック数と解釈

---

## 表示位置別の構造

### DeliveryTimeline（タイムラインビュー）
```
┌─ Date Column (dayWidth)
│  ├─ Delivery Card 1
│  │  ├─ Header: 時刻 + セグメントバッジ
│  │  ├─ KPI Grid (6 items):
│  │  │  ├─ 配信数 / 開封数 / 開封率
│  │  │  └─ クリック数 / クリック率 / 開封→tap
│  │  └─ LineMessagePreview (scaled by previewZoom)
│  └─ Delivery Card 2...
└─ Date Column...
```

### BroadcastDetail（詳細ビュー）
```
┌─ Stats Cards (配信数/開封数/開封率/クリック数/最終計測)
├─ Delivery Target Info (セグメント + 配信先条件)
├─ LEFT: LineMessagePreview (native size: 280px)
└─ RIGHT: Charts
   ├─ 開封率 推移（LineChart）
   └─ 全配信 開封率比較（BarChart vertical）
```

---

## クリック率・開封→tap率の計算

### DeliveryTimeline
```typescript
clickRate = (clickCount / delivery_count) * 100
openToClickRate = (clickCount / open_count) * 100
```

### BroadcastDetail
```typescript
clickRate = (clickCount / delivery_count) * 100
openToClickRate = (clickCount / open_count) * 100  // 開封→クリック率
```

---

## BigQuery テーブル構成

### marketing.funnels
- `id`: funnel_id
- `data`: JSON blob（FunnelData 型）
  - deliveries[] に DeliveryItem[] が含まれる
  - messages[] は既に ファネルビルダーで設定済み

### autostudio_lstep.broadcast_metrics
- `broadcast_id`, `broadcast_name`, `sent_at`, `delivery_count`, `open_count`, `open_rate`, `elapsed_minutes`, `measured_at`
- 時系列データ（同じ broadcast_id で複数行）

### autostudio_lstep.tag_metrics
- `tag_name`, `friend_count`, `measured_at`
- 最新データを QUALIFY ROW_NUMBER で抽出

---

## 既存紐付け配信の例（3月ローンチ）
- d-edu1, d-edu2, d-edu3 → lstepBroadcastId 既に設定済み
- del-a-01 ～ del-b-11 → セミナー募集配信

## 正しいmessages形式
ファネルビルダーから保存される messages は既に正しい形式：
- text 型: type: 'text', text: "本文"
- flex 新方式: type: 'flex', flexBlocks: [{ type: 'title', title: "..." }, ...]
- carousel: type: 'carousel', columns: [{ title: "...", text: "...", imageUrl: "...", actions: [...] }, ...]

AutoStudio は このmessages をそのまま LineMessagePreview に渡すだけで OK
