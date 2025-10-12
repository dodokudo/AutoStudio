'use client';

import { CompetitorHighlights } from './competitor-highlight';
import { TrendingTopics } from './trending-topics';

interface CompetitorHighlightItem {
  accountName: string;
  username?: string;
  impressions?: string;
  likes?: string;
  summary: string;
  categories: string[];
}

interface TrendingTopicItem {
  themeTag: string;
  avgFollowersDelta: number;
  avgViews: number;
  sampleAccounts: string[];
}

interface CompetitorTabProps {
  highlights: CompetitorHighlightItem[];
  trendingTopics: TrendingTopicItem[];
}

export function CompetitorTab({ highlights, trendingTopics }: CompetitorTabProps) {
  return (
    <div className="section-stack">
      <CompetitorHighlights items={highlights} />
      {trendingTopics.length ? <TrendingTopics items={trendingTopics} /> : null}
    </div>
  );
}
