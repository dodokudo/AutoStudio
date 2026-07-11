export const MAX_THREADS_MEDIA_ITEMS = 10;
export const MAX_COMMENT_MEDIA_ITEMS = 2;

export type ThreadsMediaType = 'IMAGE' | 'VIDEO';

export type ThreadsMediaItem = {
  url: string;
  type: ThreadsMediaType;
  altText?: string;
};

const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/quicktime']);

export function getThreadsMediaType(contentType: string): ThreadsMediaType | null {
  const normalized = contentType.toLowerCase().split(';')[0]?.trim() || '';
  if (IMAGE_TYPES.has(normalized)) return 'IMAGE';
  if (VIDEO_TYPES.has(normalized)) return 'VIDEO';
  return null;
}

export function getThreadsMediaExtension(contentType: string): string {
  const normalized = contentType.toLowerCase().split(';')[0]?.trim() || '';
  if (normalized === 'image/png') return 'png';
  if (normalized === 'image/webp') return 'webp';
  if (normalized === 'video/mp4') return 'mp4';
  if (normalized === 'video/quicktime') return 'mov';
  return 'jpg';
}

export function parseThreadsMediaColumns(
  urlsJson?: string | null,
  typesJson?: string | null,
  altTextsJson?: string | null,
): ThreadsMediaItem[] {
  try {
    const urls = JSON.parse(urlsJson || '[]');
    const types = JSON.parse(typesJson || '[]');
    const altTexts = JSON.parse(altTextsJson || '[]');
    if (!Array.isArray(urls) || !Array.isArray(types)) return [];

    return urls
      .map((url, index): ThreadsMediaItem => ({
        url: typeof url === 'string' ? url.trim() : '',
        type: types[index] === 'VIDEO' ? 'VIDEO' : 'IMAGE',
        altText: typeof altTexts[index] === 'string' ? altTexts[index] : undefined,
      }))
      .filter((item) => item.url)
      .slice(0, MAX_THREADS_MEDIA_ITEMS);
  } catch {
    return [];
  }
}

export function serializeThreadsMediaItems(items: ThreadsMediaItem[]) {
  const limited = items.slice(0, MAX_THREADS_MEDIA_ITEMS);
  return {
    urls: JSON.stringify(limited.map((item) => item.url)),
    types: JSON.stringify(limited.map((item) => item.type)),
    altTexts: JSON.stringify(limited.map((item) => item.altText || '')),
  };
}

export function normalizeThreadsMediaItems(value: unknown): ThreadsMediaItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item): ThreadsMediaItem | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const url = typeof record.url === 'string' ? record.url.trim() : '';
      const type: ThreadsMediaType | null =
        record.type === 'VIDEO' ? 'VIDEO' : record.type === 'IMAGE' ? 'IMAGE' : null;
      const altText = typeof record.altText === 'string' ? record.altText : undefined;
      if (!url || !type) return null;
      return { url, type, altText };
    })
    .filter((item): item is ThreadsMediaItem => Boolean(item))
    .slice(0, MAX_THREADS_MEDIA_ITEMS);
}
