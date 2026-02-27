/** Funnel types (subset from funnel builder) */

export interface Segment {
  id: string;
  name: string;
  description?: string;
  color: string;
  isDefault?: boolean;
}

export interface FlexButton {
  label: string;
  url?: string;
  action?: string;
  type?: string;
  color?: string;
}

export interface FlexBlock {
  id: string;
  type: 'title' | 'image' | 'text' | 'button' | 'video';
  content?: string;
  imageUrl?: string;
  buttons?: FlexButton[];
  videoUrl?: string;
  thumbnailUrl?: string;
  title?: string;
  subtitle?: string;
  html?: string;
  label?: string;
  padding?: string;
  backgroundColor?: string;
  isBoxed?: boolean;
  buttonStyle?: string;
  buttonColor?: string;
}

export interface CarouselColumn {
  id: string;
  title?: string;
  text?: string;
  imageUrl?: string;
  buttons?: FlexButton[];
  actions?: Array<{ label: string; color?: string }>;
}

export type LineMessageType = 'text' | 'image' | 'carousel' | 'flex' | 'richmenu';

export interface LineMessage {
  id: string;
  type: LineMessageType;
  text?: string;
  imageUrl?: string;
  columns?: CarouselColumn[];
  flexBlocks?: FlexBlock[];
  flexTitle?: string;
  flexBody?: string;
  flexImageUrl?: string;
  flexButtons?: FlexButton[];
  flexFooter?: string;
  flexHeaderColor?: string;
}

export interface DeliveryItem {
  id: string;
  date: string;
  time?: string;
  segmentId: string;
  segmentIds: string[];
  title: string;
  description?: string;
  type: 'message' | 'video' | 'sale' | 'reminder' | 'branch';
  messages?: LineMessage[];
  notificationText?: string;
  clickTag?: string;  // CTAクリックで付与されるLステップタグ名
}

export interface FunnelData {
  id: string;
  name: string;
  description?: string;
  startDate: string;
  endDate: string;
  baseDate: string;
  baseDateLabel: string;
  segments: Segment[];
  deliveries: DeliveryItem[];
  updatedAt: string;
}

export interface BroadcastMetric {
  broadcast_id: string;
  broadcast_name: string;
  sent_at: string;
  delivery_count: number;
  open_count: number;
  open_rate: number;
  elapsed_minutes: number;
  measured_at: string;
}

export interface UrlMetric {
  url_id: string;
  url_name: string;
  total_clicks: number;
  unique_visitors: number;
  click_rate: number;
  measured_at: string;
}

/** Delivery with matched metrics */
export interface DeliveryWithMetrics extends DeliveryItem {
  latestMetric?: BroadcastMetric;
  timeSeries?: BroadcastMetric[];
  clickCount?: number;  // タグの友だち人数 = クリック数
}
