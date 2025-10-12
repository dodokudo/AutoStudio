import { tavily } from '@tavily/core';

function getTavilyClient() {
  const apiKey = process.env.TAVILY_API_KEY;

  if (!apiKey) {
    throw new Error('TAVILY_API_KEY is not configured');
  }

  return tavily({ apiKey });
}

export interface TavilySearchResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

interface TavilyRawResult {
  title?: string;
  url?: string;
  content?: string;
  score?: number;
}

export interface TavilySearchOptions {
  query: string;
  searchDepth?: 'basic' | 'advanced';
  maxResults?: number;
  includeImages?: boolean;
  includeDomains?: string[];
  excludeDomains?: string[];
}

export async function searchWeb(options: TavilySearchOptions): Promise<TavilySearchResult[]> {
  const {
    query,
    searchDepth = 'basic',
    maxResults = 5,
    includeImages = false,
    includeDomains,
    excludeDomains,
  } = options;

  const client = getTavilyClient();
  const response = await client.search(query, {
    searchDepth,
    maxResults,
    includeImages,
    includeDomains,
    excludeDomains,
  });

  return response.results.map((result: TavilyRawResult) => ({
    title: result.title ?? '',
    url: result.url ?? '',
    content: result.content ?? '',
    score: result.score ?? 0,
  }));
}

export interface SearchResultWithDate extends TavilySearchResult {
  extractedDate?: Date;
}

function extractDateFromText(text: string): Date | null {
  const jpPattern = /(\d{4})年(\d{1,2})月(\d{1,2})日/;
  const match = text.match(jpPattern);
  if (match) {
    return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  }

  const isoPattern = /(\d{4})-(\d{2})-(\d{2})/;
  const isoMatch = text.match(isoPattern);
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]));
  }

  return null;
}

export async function searchMultipleTopics(
  topics: string[],
  options?: Partial<TavilySearchOptions>
): Promise<SearchResultWithDate[]> {
  const results = await Promise.all(
    topics.map(topic => searchWeb({
      query: topic,
      searchDepth: 'advanced',
      maxResults: 3,
      includeDomains: ['*.jp', 'zenn.dev', 'qiita.com', 'note.com'],
      ...options,
    }))
  );

  const flatResults = results.flat();
  const withDates: SearchResultWithDate[] = flatResults.map(result => {
    const extractedDate = extractDateFromText(result.title + ' ' + result.content);
    return { ...result, extractedDate: extractedDate || undefined };
  });

  withDates.sort((a, b) => {
    if (!a.extractedDate && !b.extractedDate) return 0;
    if (!a.extractedDate) return 1;
    if (!b.extractedDate) return -1;
    return b.extractedDate.getTime() - a.extractedDate.getTime();
  });

  return withDates;
}

export async function searchForThreadsContent(topic: string): Promise<string> {
  const results = await searchWeb({
    query: topic,
    searchDepth: 'basic',
    maxResults: 3,
  });

  if (results.length === 0) {
    return '';
  }

  const summary = results
    .map((result, index) => {
      return `【${index + 1}】${result.title}\n${result.content.slice(0, 200)}...\n`;
    })
    .join('\n');

  return summary;
}
