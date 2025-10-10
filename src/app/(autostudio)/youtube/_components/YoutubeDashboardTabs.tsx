'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';

interface OwnMetricsRow {
  label: string;
  value30: string;
  value7: string;
}

interface CompetitorRow {
  channel: string;
  subscribers: string;
  viewVelocity: string;
  engagement: string;
  latestVideo: string;
  latestPublishedAt: string;
}

interface Props {
  ownMetricsRows: OwnMetricsRow[];
  competitorRows: CompetitorRow[];
}

type TabId = 'own' | 'competitor';

const TABS: { id: TabId; label: string }[] = [
  { id: 'own', label: '自社データ' },
  { id: 'competitor', label: '競合データ' },
];

export function YoutubeDashboardTabs({ ownMetricsRows, competitorRows }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('own');

  return (
    <div className="section-stack">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            variant={activeTab === tab.id ? 'primary' : 'secondary'}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'own' ? (
        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">自チャンネル指標</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">直近30日 / 7日のスナップショットを比較します。</p>
          <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
            <Table className="text-sm">
              <thead>
                <tr>
                  <th className="w-1/3">指標</th>
                  <th>直近30日</th>
                  <th>直近7日</th>
                </tr>
              </thead>
              <tbody>
                {ownMetricsRows.map((row) => (
                  <tr key={row.label}>
                    <td className="font-medium text-[color:var(--color-text-primary)]">{row.label}</td>
                    <td>{row.value30}</td>
                    <td>{row.value7}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Card>
      ) : (
        <Card>
          <h2 className="text-lg font-semibold text-[color:var(--color-text-primary)]">競合チャンネルの動向</h2>
          <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">最新スナップショットでの主要指標です。</p>
          {competitorRows.length ? (
            <div className="mt-4 overflow-hidden rounded-[var(--radius-md)] border border-[color:var(--color-border)]">
              <Table className="text-xs">
                <thead>
                  <tr>
                    <th>チャンネル</th>
                    <th>登録者</th>
                    <th>平均伸び速度</th>
                    <th>平均ER</th>
                    <th>最新動画</th>
                    <th>投稿日</th>
                  </tr>
                </thead>
                <tbody>
                  {competitorRows.map((row) => (
                    <tr key={row.channel}>
                      <td className="font-medium text-[color:var(--color-text-primary)]">{row.channel}</td>
                      <td>{row.subscribers}</td>
                      <td>{row.viewVelocity}</td>
                      <td>{row.engagement}</td>
                      <td>{row.latestVideo}</td>
                      <td>{row.latestPublishedAt}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <EmptyState title="データがありません" description="競合チャンネルの統計が取り込まれると表示されます。" />
          )}
        </Card>
      )}
    </div>
  );
}
