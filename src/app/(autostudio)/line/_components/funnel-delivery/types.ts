// セグメント定義
export interface Segment {
  id: string;
  name: string;
  description?: string;
  color: string;
  isDefault?: boolean; // 「全員」のようなデフォルトセグメント
  contentMode?: 'delivery' | 'page';
  previewUrl?: string;
  previewUrls?: string[];
  previewNames?: string[];
}
// LINE風メッセージ型
export type LineMessageType = 'text' | 'image' | 'carousel' | 'flex' | 'richmenu' | 'audio' | 'video';

export interface FlexButton {
  label: string;
  type: 'uri' | 'message' | 'postback';
  value?: string;
  color?: string;
}

// フレックスメッセージのブロック型（新方式）
export type FlexBlockType = 'title' | 'image' | 'text' | 'button' | 'video';

export interface FlexBlock {
  id: string;
  type: FlexBlockType;
  // title block
  title?: string;
  subtitle?: string;
  // image block
  imageUrl?: string;
  // text block
  html?: string; // リッチテキスト（<strong>, <u>, <span class="size_L"> 等）
  isBoxed?: boolean; // 囲み（グレー背景の引用風ボックス）
  // button block
  label?: string;
  action?: FlexButton;
  buttonStyle?: 'filled' | 'outlined'; // 塗りつぶし or 枠線
  buttonColor?: string;
  // 共通
  backgroundColor?: string;
  padding?: 'normal' | 'wide' | 'top-wide' | 'bottom-wide';
}

export interface CarouselColumn {
  id: string;
  title?: string;
  text?: string;
  imageUrl?: string;
  actions?: FlexButton[];
}

export interface LineMessage {
  id: string;
  type: LineMessageType;
  text?: string;                // テキスト吹き出し用
  imageUrl?: string;            // 画像（Base64 or URL）
  columns?: CarouselColumn[];   // カルーセル用
  flexTitle?: string;           // フレックス用（旧方式、後方互換）
  flexBody?: string;
  flexImageUrl?: string;
  flexButtons?: FlexButton[];
  flexFooter?: string;
  flexBlocks?: FlexBlock[];     // フレックス用（新方式：ブロック配列）
  flexHeaderColor?: string;     // ヘッダー背景色
}

// 配信アイテム（各セルの内容）
export interface DeliveryItem {
  id: string;
  date: string; // YYYY-MM-DD
  startDate?: string; // YYYY-MM-DD（後方互換）
  endDate?: string; // YYYY-MM-DD（後方互換）
  time?: string; // HH:MM（配信時間・後方互換）
  scheduleLabel?: string; // 自由入力の配信タイミング（例: 登録後5分、3日目 20:00）
  segmentId: string; // 後方互換性のため残す（単一セグメントの場合）
  segmentIds: string[]; // 複数セグメント対応（これを優先）
  title: string;
  description?: string;
  type: 'message' | 'video' | 'sale' | 'reminder' | 'branch'; // 配信タイプ
  canvasPosition?: { x: number; y: number }; // キャンバス上の手動配置位置
  images?: string[]; // Base64画像データ（LINEメッセージスクショ等）
  messages?: LineMessage[]; // LINE風メッセージ（存在すればLINE UIで表示）
  notificationText?: string; // プッシュ通知テキスト（altText）
  // Lステップ連携（/lstep-broadcast スキルが自動設定）
  clickTag?: string; // クリック時に付与するタグ名（例: "3M:Day1閲覧"）
  lstepTemplateId?: string; // LステップテンプレートID（パック or 個別）
  lstepTemplateFolder?: string; // テンプレートのフォルダ名
  lstepUrlId?: string; // URL計測ID
  lstepUrlSlug?: string; // 短縮URLスラッグ（lstep.app/xxx）
  lstepTagFolder?: string; // タグフォルダ名
  lstepBroadcastId?: string; // 一斉配信ID（予約後に書き戻し）
  deliveryTarget?: string; // Lステップ配信先条件（例: "全員", "タグ:3M:登録日"）
}

// 接続（配信間の矢印）
export interface Connection {
  id: string;
  fromDeliveryId: string; // 接続元の配信ID
  toDeliveryId: string;   // 接続先の配信ID
  label?: string;         // 接続ラベル（条件など）
  fromHandle?: 'top' | 'right' | 'bottom' | 'left';
  toHandle?: 'top' | 'right' | 'bottom' | 'left';
}

// 分岐点（あるセグメントから別のセグメントへの分岐）- 廃止予定
export interface BranchPoint {
  id: string;
  date: string; // 分岐が発生する日付
  fromSegmentId: string; // 分岐元（通常は「全員」）
  toSegmentIds: string[]; // 分岐先のセグメントID配列
  condition?: string; // 分岐条件の説明
}

// KPI（フェーズごとの目標数値）
export interface KPI {
  target: number; // 目標人数
  rate: number;   // 前フェーズからのCVR (%) — 自動計算
  denominatorIndices?: number[]; // CVR計算の分母（未設定時は前項目）
  width: number;  // フェーズの幅 (px)
}

// 期間（タイムライン上部に表示する色付き帯）
export interface Period {
  id: string;
  name: string;       // 「準備期間」「販売期間」「フォロー期間」など
  startDate: string;  // YYYY-MM-DD
  endDate: string;    // YYYY-MM-DD
  color: string;      // 背景色
}

// ノードテンプレート（ツールボックス用）
export interface NodeTemplate {
  id: string;
  name: string;       // 表示名（例：「LP」「LINE配信」「決済ページ」）
  icon: string;       // アイコン（絵文字）
  color: string;      // ノードの色
  isDefault?: boolean; // デフォルトテンプレートかどうか
}

// デフォルトのノードテンプレート
export const DEFAULT_NODE_TEMPLATES: NodeTemplate[] = [
  { id: 'threads', name: 'Threads', icon: 'threads', color: '#eef2ff', isDefault: true },
  { id: 'instagram', name: 'Instagram', icon: 'instagram', color: '#fdf2f8', isDefault: true },
  { id: 'ad', name: '広告', icon: 'ad', color: '#f5f3ff', isDefault: true },
  { id: 'line', name: 'LINE登録', icon: 'line', color: '#ecfdf3', isDefault: true },
  { id: 'survey', name: '回答フォーム', icon: 'survey', color: '#ecfdf5', isDefault: true },
  { id: 'broadcast', name: '配信', icon: 'broadcast', color: '#f0fdf4', isDefault: true },
  { id: 'lp', name: 'LP', icon: 'lp', color: '#eff6ff', isDefault: true },
  { id: 'seminar', name: 'セミナー', icon: 'seminar', color: '#fffbeb', isDefault: true },
  { id: 'remind', name: 'リマインド', icon: 'remind', color: '#fffbeb', isDefault: true },
  { id: 'sales', name: '販売', icon: 'sales_meeting', color: '#fff7ed', isDefault: true },
  { id: 'payment', name: '決済', icon: 'payment', color: '#fff7ed', isDefault: true },
];

// タスク担当者
export interface TaskAssignee {
  id: string;
  name: string;
  color: string;
}

// デフォルトの担当者カラー
export const ASSIGNEE_COLORS = [
  '#6467f2', // 紫
  '#10B981', // 緑
  '#F59E0B', // 黄
  '#EF4444', // 赤
  '#3B82F6', // 青
  '#8B5CF6', // 紫
  '#EC4899', // ピンク
  '#14B8A6', // ティール
];

// サブタスク
export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
  startDate?: string;
  dueDate?: string;
}

// タスク
export interface Task {
  id: string;
  title: string;
  description?: string;
  startDate?: string; // 開始日 (YYYY-MM-DD)
  dueDate?: string; // 期日 (YYYY-MM-DD)
  phaseIndex: number; // どのカテゴリーに属するか
  assigneeId?: string; // 担当者ID
  completed: boolean;
  order: number; // カテゴリー内での順番
  subtasks?: SubTask[];
  notionUrl?: string; // Notion詳細ページへのリンク
  parentTaskId?: string; // 親タスクID（CSVの親子関係を表現）
  reminderEventId?: string; // Guardian event_id（リマインド登録済みの場合）
  reminderStatus?: 'pending' | 'reminded' | 'cancelled'; // リマインド状態
}

// セグメント間の移行（フローチャート用）
export interface SegmentTransition {
  id: string;
  fromSegmentId: string; // 移行元セグメント（'entry'は流入元）
  toSegmentId: string;   // 移行先セグメント
  condition: string;     // 移行条件（例: 「LINE登録」「購入完了」）
  description?: string;  // 補足説明
}

// 入口（SNS媒体）
export type SNSPlatform = 'twitter' | 'instagram' | 'tiktok' | 'youtube' | 'threads' | 'line' | 'other';

export interface EntryPoint {
  id: string;
  platform: SNSPlatform;
  label: string;
  description?: string;
}

// テンプレート種別
export type TemplateType =
  | 'preparation'                    // 準備テンプレート（O→1の人向け）
  | 'zero-to-one'                    // O→1ローンチ（77日）
  | 'long-video-consultation'        // 長尺動画→個別相談（64日）
  | 'long-video-seminar-consultation'; // 長尺動画→セミナー→個別相談（64日）

// ファネル全体
export interface Funnel {
  id: string;
  name: string;
  description?: string;
  documentContent?: string;
  mindmapContent?: string;

  // 所属フォルダ
  folderId?: string | null;

  // テンプレート関連
  isTemplate?: boolean; // trueならテンプレートファネル（一覧に表示しない）
  templateType?: TemplateType; // テンプレートの種別
  studentId?: string; // 受講生に紐付いたファネルの場合
  tabOrder?: number; // 受講生編集画面のローンチ切替タブの表示順

  // 基準日（販売日など）
  baseDate: string; // YYYY-MM-DD（開始日）
  baseDateDays: number; // 期間（日数）。1なら1日だけ、5なら5日間
  baseDateLabel: string; // 「販売日」「セミナー日」など

  // 表示期間
  startDate: string;
  endDate: string;

  // 入口
  entryPoints: EntryPoint[];

  // セグメント
  segments: Segment[];

  // 配信アイテム
  deliveries: DeliveryItem[];

  // 接続（矢印）
  connections: Connection[];

  // セグメント間の移行（フローチャート用）
  transitions: SegmentTransition[];

  // フリーキャンバス用（React Flow）
  canvasNodes: any[];
  canvasEdges: any[];

  // フェーズ名（カスタマイズ可能）
  phaseNames?: string[];

  // KPI（各フェーズの目標）
  kpis?: KPI[];

  // ノードテンプレート（ツールボックス用）
  nodeTemplates?: NodeTemplate[];

  // タスク（カンバン形式）
  tasks?: Task[];

  // タスクカテゴリ（ファネルとは独立）
  taskCategories?: string[];
  // タスク担当者
  taskAssignees?: TaskAssignee[];
  // 旧: タスク用フェーズ（互換用）
  taskPhases?: string[];

  // 分岐点（廃止予定、connectionsで代替）
  branchPoints: BranchPoint[];

  // 期間（タイムライン上部の色帯）
  periods?: Period[];

  // Lステップ連携リソース（ファネル単位で管理。/lstep-broadcast スキルが自動設定）
  lstepResources?: {
    // シナリオ（経過時間 or 時刻配信）
    scenarios?: Array<{ name: string; lstepId: string; description?: string }>;
    // リマインダ（目標日ベース）
    reminders?: Array<{ name: string; lstepId: string; triggerTag?: string }>;
    // 回答フォーム
    forms?: Array<{ name: string; lstepId: string; lstepFormCode?: string }>;
    // 流入経路
    inflowRoutes?: Array<{ name: string; lstepId: string; url?: string }>;
    // フォルダ名（テンプレート・タグ・URL計測の格納先）
    templateFolder?: string;
    tagFolder?: string;
    urlFolder?: string;
  };

  createdAt: string;
  updatedAt: string;
}

// SNSプラットフォームの表示設定
export const SNS_PLATFORMS: Record<SNSPlatform, { label: string; color: string }> = {
  twitter: { label: 'X (Twitter)', color: '#000000' },
  instagram: { label: 'Instagram', color: '#E4405F' },
  tiktok: { label: 'TikTok', color: '#000000' },
  youtube: { label: 'YouTube', color: '#FF0000' },
  threads: { label: 'Threads', color: '#000000' },
  line: { label: 'LINE', color: '#06C755' },
  other: { label: 'その他', color: '#6B7280' },
};

// 配信タイプの表示設定
export const DELIVERY_TYPES: Record<DeliveryItem['type'], { label: string; color: string; icon: string }> = {
  message: { label: 'メッセージ', color: '#3B82F6', icon: '💬' },
  video: { label: '動画', color: '#8B5CF6', icon: '🎬' },
  sale: { label: '販売', color: '#EF4444', icon: '🛒' },
  reminder: { label: 'リマインド', color: '#F59E0B', icon: '🔔' },
  branch: { label: '分岐', color: '#10B981', icon: '🔀' },
};

// デフォルトセグメント
export const DEFAULT_SEGMENTS: Segment[] = [
  { id: 'all', name: '全員', color: '#6B7280', isDefault: true },
];

// デフォルトのタスクカテゴリー（ファネルのフェーズとは独立）
export const DEFAULT_TASK_CATEGORIES: string[] = [
  '企画',
  '制作',
  '配信',
];

// ローカル時間で日付文字列を生成するヘルパー関数
function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 新規ファネルのデフォルト値
export function createDefaultFunnel(id: string): Funnel {
  const today = new Date();
  const baseDate = new Date(today);
  baseDate.setDate(baseDate.getDate() + 14); // 2週間後をデフォルトの販売日に

  const startDate = new Date(today);
  const endDate = new Date(baseDate);
  endDate.setDate(endDate.getDate() + 7); // 販売日の1週間後まで表示

  return {
    id,
    name: '新規ファネル',
    description: '',
    folderId: null,
    baseDate: formatLocalDate(baseDate),
    baseDateDays: 3, // デフォルトは3日間
    baseDateLabel: '販売期間',
    startDate: formatLocalDate(startDate),
    endDate: formatLocalDate(endDate),
    entryPoints: [],
    segments: [...DEFAULT_SEGMENTS],
    deliveries: [],
    connections: [],
    transitions: [],
    canvasNodes: [],
    canvasEdges: [],
    branchPoints: [],
    taskCategories: [...DEFAULT_TASK_CATEGORIES],
    documentContent: '',
    mindmapContent: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
