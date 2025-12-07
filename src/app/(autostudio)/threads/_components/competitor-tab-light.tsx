'use client';

import { CompetitorStatsCard } from './competitor-stats-card';
import { CompetitorDetailGrid } from './competitor-detail-grid';

interface CompetitorTabLightProps {
  startDate: string;
  endDate: string;
}

export function CompetitorTabLight({ startDate, endDate }: CompetitorTabLightProps) {
  return (
    <div className="section-stack">
      <CompetitorStatsCard startDate={startDate} endDate={endDate} />
      <CompetitorDetailGrid startDate={startDate} endDate={endDate} />
    </div>
  );
}
