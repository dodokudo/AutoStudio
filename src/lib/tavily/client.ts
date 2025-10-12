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
