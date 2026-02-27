/** 一斉配信メトリクス -- broadcast_metrics テーブルの行 */
export interface BroadcastMetricRow {
  measured_at: string;        // ISO timestamp
  broadcast_id: string;       // sendlogs URLから抽出したID
  broadcast_name: string;     // 配信名
  sent_at: string;           // 配信日時文字列
  delivery_count: number;     // 配信数
  open_count: number;         // 開封数
  open_rate: number;          // 開封率（%）
  elapsed_minutes: number;    // 配信からの経過分数
}

/** URLクリックメトリクス -- url_click_metrics テーブルの行 */
export interface UrlClickMetricRow {
  measured_at: string;
  url_id: string;
  url_name: string;
  total_clicks: number;
  unique_visitors: number;
  click_rate: number;
  elapsed_minutes: number;
}

/** 計測スケジュール -- measurement_schedule テーブルの行 */
export interface MeasurementScheduleRow {
  id: string;
  broadcast_id: string;
  broadcast_name: string;
  sent_at: string;           // ISO timestamp
  measure_at: string;        // ISO timestamp
  elapsed_minutes: number;
  status: 'pending' | 'completed' | 'failed';
  completed_at?: string;
  error_message?: string;
}

/** スクレイピングで取得した一斉配信の1行分 */
export interface ScrapedBroadcast {
  broadcastId: string;       // sendlogs URLのIDパート
  broadcastName: string;     // 配信名
  sentAt: string;            // 配信日時テキスト
  deliveryCount: number;     // 配信数
  openCount: number;         // 開封数
  openRate: number;          // 開封率（%）
}

/** スクレイピングで取得したURL計測の1行分 */
export interface ScrapedUrlMetric {
  urlId: string;
  urlName: string;
  totalClicks: number;
  uniqueVisitors: number;
  clickRate: number;
}

/** スクレイピングで取得したタグメトリクスの1行分 */
export interface ScrapedTagMetric {
  tagName: string;      // "3M:Day1閲覧"
  friendCount: number;  // 64
}

/** 計測タイミング定義 */
export const MEASUREMENT_POINTS = [
  { label: 'T1', elapsedMinutes: 30 },
  { label: 'T2', elapsedMinutes: 60 },
  { label: 'T3', elapsedMinutes: 720 },
  { label: 'T4', elapsedMinutes: 1440 },
  // T5-T12 are absolute times (9:00 / 21:00 on days 2-5)
  // Generated dynamically based on sent_at
] as const;

/** 絶対時刻計測ポイント（2日目〜5日目） */
export const ABSOLUTE_MEASUREMENT_HOURS = [
  { day: 2, hour: 9 },
  { day: 2, hour: 21 },
  { day: 3, hour: 9 },
  { day: 3, hour: 21 },
  { day: 4, hour: 9 },
  { day: 4, hour: 21 },
  { day: 5, hour: 9 },
  { day: 5, hour: 21 },
] as const;
