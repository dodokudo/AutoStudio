# AutoStudio - Lステップデータ構造

## プロジェクト構成
- **Type**: Next.js 14 + BigQuery
- **Lステップコード**: `/Users/kudo/AutoStudio/src/lib/lstep/`
- **スクリプト**: `/Users/kudo/AutoStudio/src/scripts/`
- **APIルート**: `/Users/kudo/AutoStudio/src/app/api/line/`

## データ保存場所
### BigQuery
- **データセット**: `autostudio_lstep` （環境変数 `LSTEP_BQ_DATASET` で変更可）
- **メインテーブル**: `lstep_friends_raw` （友だち情報の完全版から生成）
- **スキーマテーブル**:
  - `user_core` テーブル（計5テーブル生成）
  - `user_tags` テーブル
  - `user_sources` テーブル
  - `user_surveys` テーブル

### CSV入手経路
1. Lステップから毎日CSVをダウンロード（`downloadLstepCsv()` in downloader.ts）
2. GCSにアップロード（`uploadFileToGcs()` in gcs.ts）
3. BigQueryにロード（`runLstepIngestion` スクリプト）

## データスキーマ

### 1. ユーザーコア情報 (user_core テーブル)
```typescript
interface UserCoreRow {
  snapshot_date: string;      // DATE型 - REQUIRED
  user_id: string;            // STRING型 - REQUIRED
  display_name: string | null;
  friend_added_at: string | null;  // STRING (後でBigQueryでTIMESTAMPに変換)
  blocked: boolean | null;
  last_msg_at: string | null;      // STRING (後でBigQueryでTIMESTAMPに変換)
  scenario_name: string | null;    // 購読中シナリオ
  scenario_days: number | null;    // シナリオ日数
}
```

### 2. ユーザータグ (user_tags テーブル)
```typescript
interface UserTagRow {
  snapshot_date: string;  // DATE型 - REQUIRED
  user_id: string;        // STRING型 - REQUIRED
  tag_id: string;         // STRING型 - REQUIRED
  tag_name: string;       // STRING型 - REQUIRED（わかりやすい名前）
  tag_flag: number;       // INT64型 - REQUIRED (1=タグあり, 0=タグなし)
}
```
- **タグは動的**: Lステップで定義されたすべてのタグを自動抽出
- **タグ抽出ロジック**: INT64型のカラム（システムカラム除外）をタグとして扱う

### 3. 流入経路 (user_sources テーブル)
```typescript
interface UserSourceRow {
  snapshot_date: string;  // DATE型 - REQUIRED
  user_id: string;        // STRING型 - REQUIRED
  source_name: string;    // STRING型 - REQUIRED (プレフィックス除外済み)
  source_flag: number;    // INT64型 - REQUIRED (1=流入経路あり, 0=なし)
}
```

### 4. アンケート回答 (user_surveys テーブル)
```typescript
interface UserSurveyRow {
  snapshot_date: string;  // DATE型 - REQUIRED
  user_id: string;        // STRING型 - REQUIRED
  question: string;       // STRING型 - REQUIRED (プレフィックス除外済み)
  answer_flag: number;    // INT64型 - REQUIRED (1=回答あり, 0=未回答)
}
```

## CSVトランスフォーメーション

### Lステップ CSV 構造（入力）
```
行1: 内部カラムID列
行2: 日本語ラベル列
行3以降: データ行
```

### CSVのカラム分類
1. **Core フィールド** (必須):
   - ID / 登録ID → user_id
   - 表示名 → display_name
   - 友だち追加日時 → friend_added_at
   - ユーザーブロック → blocked
   - 最終メッセージ日時 → last_msg_at
   - 購読中シナリオ → scenario_name
   - シナリオ日数 → scenario_days

2. **Tag** (数値カラム):
   - INT64型 & システムカラム以外
   - タグのON/OFF フラグ (1/0)
   - CSVの場合は tag_id = 内部ID, tag_name = ラベル

3. **Source** (流入経路):
   - ラベル: `流入経路: XXX` という形式
   - 数値カラム (1/0 フラグ)

4. **Survey** (アンケート):
   - ラベル: `アンケート: YYY` という形式
   - 数値カラム (1/0 フラグ)

## ファネル定義

### プリセット1: Threads ファネル分析 (PRESET_FUNNEL_IGLN)
```
id: 'igln'
steps:
  1. 計測対象 (friend_added_at)
  2. アンケート回答完了 (survey_completed)
  3. 動画LP遷移 (th_video_lp)
  4. 動画閲覧 (th_video_watched)
  5. 個別相談フォーム遷移 (th_consultation_form)
  6. 個別相談申込済み (th_consultation_applied)
  7. 成約 (th_contracted)
```

### プリセット2: アンケート回答ファネル (PRESET_FUNNEL_SURVEY)
```
id: 'survey'
steps:
  1. 計測対象 (friend_added_at)
  2. アンケート回答 (survey_form_inflow)
```

## BigQueryの大運用
- **パーティション**: `snapshot_date` (日単位)
- **クラスタリング**: user_id
- **キー情報**: 毎日のスナップショット形式（差分ではなく全体スナップショット）

## データ流れ
```
Lステップ CSV
  ↓ (downloadLstepCsv)
GCS バケット
  ↓ (runLstepIngestion スクリプト)
BigQuery
  - lstep_friends_raw (rawCsvLoader 経由、完全版テーブル)
  - user_core (正規化)
  - user_tags (正規化)
  - user_sources (正規化)
  - user_surveys (正規化)
  ↓ (API)
/api/line/tags → タグ一覧 + tag_column リスト
/api/line/funnel → ファネル分析結果
```

## 重要な定数・カラム名（変更禁止）
- ファネルの タグカラム名は `lstep_friends_raw` テーブルのカラムそのものを参照
- tags.ts: 除外カラム = ['id', 'user_id', 'name', 'display_name', 'friend_added_at', 'snapshot_date', 'created_at', 'updated_at']
