'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card } from '@/components/ui/card';
import { classNames } from '@/lib/classNames';

interface TopPost {
  postId: string;
  text: string;
  impressions: number;
  likes: number;
  postDate: string;
}

interface DailyMetric {
  date: string;
  impressions: number;
  likes: number;
  followers: number;
  followerChange: number;
}

interface CompetitorDetail {
  username: string;
  accountName: string;
  topPosts: TopPost[];
  allPosts: TopPost[];
  dailyMetrics: DailyMetric[];
  currentFollowers: number;
  followerDelta: number;
  dailyFollowerDelta: number;
  postCount: number;
  avgImpressions: number;
  isSelf: boolean;
}

interface CompetitorDetailResponse {
  accounts: CompetitorDetail[];
  startDate: string;
  endDate: string;
}

interface CompetitorDetailGridProps {
  startDate: string;
  endDate: string;
}

type SortOption = 'followerDelta' | 'avgImpressions' | 'postCount' | 'currentFollowers' | 'dailyFollowerDelta';

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: 'followerDelta', label: 'フォロワー増加数順' },
  { value: 'avgImpressions', label: '平均インプレッション順' },
  { value: 'postCount', label: '投稿数順' },
  { value: 'currentFollowers', label: 'フォロワー数順' },
  { value: 'dailyFollowerDelta', label: '日次増加順' },
];

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch');
  return res.json();
};

function MiniComposedChart({ data }: { data: DailyMetric[] }) {
  const numberFormatter = new Intl.NumberFormat('ja-JP');
  const dateFormatter = new Intl.DateTimeFormat('ja-JP', { month: '2-digit', day: '2-digit' });

  if (data.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-[color:var(--color-text-muted)]">
        データなし
      </div>
    );
  }

  const chartData = data.map((d) => {
    let displayDate = d.date;
    const parsed = new Date(d.date);
    if (!Number.isNaN(parsed.getTime())) {
      displayDate = dateFormatter.format(parsed);
    }
    return { ...d, displayDate };
  });

  // フォロワー増加数は0以上に補正
  const chartDataWithClamp = chartData.map((d) => ({
    ...d,
    followerChangeDisplay: Math.max(0, d.followerChange),
  }));

  const maxImp = Math.max(...data.map((d) => d.impressions), 1);
  const maxFollower = Math.max(...data.map((d) => Math.max(0, d.followerChange)), 1);
  const impAxisMax = Math.ceil(maxImp * 1.1);
  const followerAxisMax = Math.ceil(maxFollower * 1.2);

  return (
    <div className="h-32">
      <ResponsiveContainer>
        <ComposedChart data={chartDataWithClamp} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" />
          <XAxis
            dataKey="displayDate"
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            yAxisId="left"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            domain={[0, impAxisMax]}
            tickFormatter={(v) => v >= 1000 ? `${Math.round(v/1000)}k` : v}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            axisLine={false}
            tickLine={false}
            tick={{ fontSize: 9, fill: '#94a3b8' }}
            domain={[0, followerAxisMax]}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{ fontSize: 11, padding: '4px 8px' }}
            formatter={(value, name) => [
              numberFormatter.format(value as number),
              name,
            ]}
            labelFormatter={(_, payload) => {
              const originalDate = payload?.[0]?.payload?.date;
              return originalDate ?? '';
            }}
          />
          <Bar
            yAxisId="right"
            dataKey="followerChangeDisplay"
            name="フォロワー増加"
            fill="#10b981"
            opacity={0.7}
            radius={[2, 2, 0, 0]}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="impressions"
            name="インプレッション"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function PostModal({
  post,
  accountName,
  onClose,
  onBack,
}: {
  post: TopPost;
  accountName: string;
  onClose: () => void;
  onBack?: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (onBack) {
          onBack();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, onBack]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onBack || onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 戻るボタン（全投稿一覧から開いた場合のみ表示） */}
        {onBack && (
          <button
            onClick={onBack}
            className="mb-3 flex items-center gap-1 text-sm text-[color:var(--color-text-secondary)] hover:text-[color:var(--color-text-primary)]"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            一覧に戻る
          </button>
        )}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-[color:var(--color-text-primary)]">
              {accountName}
            </p>
            <p className="text-xs text-[color:var(--color-text-muted)]">{post.postDate}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="mb-4 whitespace-pre-wrap text-sm text-[color:var(--color-text-primary)]">
          {post.text}
        </div>
        <div className="flex gap-4 border-t pt-4 text-sm">
          <div>
            <span className="text-[color:var(--color-text-muted)]">インプレッション: </span>
            <span className="font-semibold">{post.impressions.toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[color:var(--color-text-muted)]">いいね: </span>
            <span className="font-semibold">{post.likes.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function AllPostsModal({
  posts,
  accountName,
  onClose,
  onSelectPost,
}: {
  posts: TopPost[];
  accountName: string;
  onClose: () => void;
  onSelectPost: (post: TopPost) => void;
}) {
  const numberFormatter = new Intl.NumberFormat('ja-JP');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <p className="text-lg font-semibold text-[color:var(--color-text-primary)]">
              {accountName} の全投稿
            </p>
            <p className="text-sm text-[color:var(--color-text-muted)]">{posts.length}件</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="max-h-[calc(85vh-80px)] overflow-y-auto p-4">
          <div className="space-y-2">
            {posts.map((post, i) => (
              <button
                key={post.postId}
                onClick={() => onSelectPost(post)}
                className="w-full rounded-lg border border-[color:var(--color-border)] p-3 text-left transition-colors hover:bg-[color:var(--color-surface-muted)]"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="line-clamp-2 text-sm text-[color:var(--color-text-primary)]">
                      {post.text.substring(0, 100)}...
                    </p>
                    <div className="mt-2 flex items-center gap-3 text-xs text-[color:var(--color-text-muted)]">
                      <span>{post.postDate}</span>
                      <span>·</span>
                      <span>{numberFormatter.format(post.impressions)} imp</span>
                      <span>·</span>
                      <span>{numberFormatter.format(post.likes)} likes</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SortableAccountCard({ account, id }: { account: CompetitorDetail; id: string }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
  };

  const [selectedPost, setSelectedPost] = useState<TopPost | null>(null);
  const [showAllPosts, setShowAllPosts] = useState(false);
  const [openedFromAllPosts, setOpenedFromAllPosts] = useState(false);
  const numberFormatter = new Intl.NumberFormat('ja-JP');

  const totalImpressions = account.allPosts.reduce((sum, p) => sum + p.impressions, 0);

  return (
    <>
      <div ref={setNodeRef} style={style}>
        <Card
          className={classNames(
            'flex flex-col',
            account.isSelf && 'ring-2 ring-indigo-500 ring-offset-2',
            isDragging && 'shadow-lg'
          )}
        >
          {/* ドラッグハンドル */}
          <div
            {...attributes}
            {...listeners}
            className="mb-2 flex cursor-grab items-center justify-center rounded bg-gray-100 py-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600 active:cursor-grabbing"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </div>
        {/* ヘッダー */}
        <div className="flex items-center gap-2">
          {account.isSelf && (
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
              自分
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p className="truncate font-medium text-[color:var(--color-text-primary)]">
              {account.accountName}
            </p>
            <p className="text-xs text-[color:var(--color-text-muted)]">@{account.username}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-[color:var(--color-text-primary)]">
              {numberFormatter.format(totalImpressions)}
            </p>
            <p className="text-[10px] text-[color:var(--color-text-muted)]">合計imp</p>
          </div>
        </div>

        {/* フォロワー情報 */}
        <div className="mt-3 grid grid-cols-5 gap-2 rounded-lg bg-[color:var(--color-surface-muted)] px-3 py-2">
          <div>
            <p className="text-[9px] text-[color:var(--color-text-muted)]">フォロワー</p>
            <p className="text-xs font-medium text-[color:var(--color-text-primary)]">
              {numberFormatter.format(account.currentFollowers)}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-[color:var(--color-text-muted)]">増加数</p>
            <p className={classNames(
              'text-xs font-medium',
              account.followerDelta > 0 ? 'text-green-600' : 'text-[color:var(--color-text-secondary)]'
            )}>
              {account.followerDelta > 0 ? '+' : ''}{numberFormatter.format(account.followerDelta)}
            </p>
          </div>
          <div>
            <p className="text-[9px] text-[color:var(--color-text-muted)]">日次増加</p>
            <p className={classNames(
              'text-xs font-medium',
              account.dailyFollowerDelta > 0 ? 'text-green-600' : 'text-[color:var(--color-text-secondary)]'
            )}>
              {account.dailyFollowerDelta > 0 ? '+' : ''}{account.dailyFollowerDelta}/日
            </p>
          </div>
          <div>
            <p className="text-[9px] text-[color:var(--color-text-muted)]">投稿数</p>
            <p className="text-xs font-medium text-[color:var(--color-text-primary)]">
              {account.postCount}件
            </p>
          </div>
          <div>
            <p className="text-[9px] text-[color:var(--color-text-muted)]">平均imp</p>
            <p className="text-xs font-medium text-[color:var(--color-text-primary)]">
              {numberFormatter.format(account.avgImpressions)}
            </p>
          </div>
        </div>

        {/* 複合グラフ */}
        <div className="mt-4">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
            インプレッション（線）& フォロワー増加（棒）
          </p>
          <MiniComposedChart data={account.dailyMetrics} />
        </div>

        {/* トップ3投稿 */}
        <div className="mt-4">
          <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[color:var(--color-text-secondary)]">
            Top 3 投稿
          </p>
          <div className="space-y-2">
            {account.topPosts.length === 0 ? (
              <p className="text-xs text-[color:var(--color-text-muted)]">投稿なし</p>
            ) : (
              account.topPosts.map((post, i) => (
                <button
                  key={post.postId}
                  onClick={() => setSelectedPost(post)}
                  className="w-full rounded-lg border border-[color:var(--color-border)] p-2 text-left transition-colors hover:bg-[color:var(--color-surface-muted)]"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={classNames(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold',
                        i === 0
                          ? 'bg-amber-100 text-amber-700'
                          : i === 1
                            ? 'bg-gray-200 text-gray-600'
                            : 'bg-orange-100 text-orange-700'
                      )}
                    >
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="line-clamp-2 text-xs text-[color:var(--color-text-primary)]">
                        {post.text.substring(0, 80)}...
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-[color:var(--color-text-muted)]">
                        <span>{post.postDate}</span>
                        <span>·</span>
                        <span>{numberFormatter.format(post.impressions)} imp</span>
                        <span>·</span>
                        <span>{numberFormatter.format(post.likes)} likes</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
          {account.allPosts.length > 3 && (
            <button
              onClick={() => setShowAllPosts(true)}
              className="mt-3 w-full rounded-lg border border-[color:var(--color-border)] py-2 text-xs font-medium text-[color:var(--color-text-secondary)] transition-colors hover:bg-[color:var(--color-surface-muted)]"
            >
              全ての投稿を見る（{account.allPosts.length}件）
            </button>
          )}
        </div>
        </Card>
      </div>

      {selectedPost && (
        <PostModal
          post={selectedPost}
          accountName={account.accountName}
          onClose={() => {
            setSelectedPost(null);
            setOpenedFromAllPosts(false);
          }}
          onBack={openedFromAllPosts ? () => {
            setSelectedPost(null);
            setShowAllPosts(true);
          } : undefined}
        />
      )}

      {showAllPosts && (
        <AllPostsModal
          posts={account.allPosts}
          accountName={account.accountName}
          onClose={() => setShowAllPosts(false)}
          onSelectPost={(post) => {
            setShowAllPosts(false);
            setOpenedFromAllPosts(true);
            setSelectedPost(post);
          }}
        />
      )}
    </>
  );
}

export function CompetitorDetailGrid({ startDate, endDate }: CompetitorDetailGridProps) {
  const [sortBy, setSortBy] = useState<SortOption | 'manual'>('followerDelta');
  const [customOrder, setCustomOrder] = useState<string[]>([]);
  const { data, error, isLoading } = useSWR<CompetitorDetailResponse>(
    startDate && endDate
      ? `/api/threads/competitor-detail?startDate=${startDate}&endDate=${endDate}`
      : null,
    fetcher
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  if (error) {
    return (
      <Card>
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-red-500">詳細データの取得に失敗しました</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <div className="flex h-48 items-center justify-center">
          <p className="text-sm text-[color:var(--color-text-muted)]">読み込み中...</p>
        </div>
      </Card>
    );
  }

  if (!data || data.accounts.length === 0) {
    return (
      <Card>
        <div className="flex h-32 items-center justify-center">
          <p className="text-sm text-[color:var(--color-text-muted)]">
            表示できるデータがありません
          </p>
        </div>
      </Card>
    );
  }

  // 自分のアカウントを先頭に固定し、残りをソート
  const selfAccount = data.accounts.find((a) => a.isSelf);
  const otherAccounts = data.accounts.filter((a) => !a.isSelf);

  let sortedOthers: CompetitorDetail[];

  if (sortBy === 'manual' && customOrder.length > 0) {
    // カスタム順序を使用
    const accountMap = new Map(otherAccounts.map((a) => [a.username, a]));
    sortedOthers = customOrder
      .filter((username) => accountMap.has(username))
      .map((username) => accountMap.get(username)!)
      .concat(otherAccounts.filter((a) => !customOrder.includes(a.username)));
  } else {
    sortedOthers = [...otherAccounts].sort((a, b) => {
      switch (sortBy) {
        case 'followerDelta':
          return b.followerDelta - a.followerDelta;
        case 'avgImpressions':
          return b.avgImpressions - a.avgImpressions;
        case 'postCount':
          return b.postCount - a.postCount;
        case 'currentFollowers':
          return b.currentFollowers - a.currentFollowers;
        case 'dailyFollowerDelta':
          return b.dailyFollowerDelta - a.dailyFollowerDelta;
        default:
          return 0;
      }
    });
  }

  const sortedAccounts = selfAccount ? [selfAccount, ...sortedOthers] : sortedOthers;
  const accountIds = sortedAccounts.map((a) => a.username);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = accountIds.indexOf(active.id as string);
      const newIndex = accountIds.indexOf(over.id as string);

      // 自分のアカウントは移動させない
      if (selfAccount) {
        if (oldIndex === 0 || newIndex === 0) return;
      }

      const newOrder = arrayMove(accountIds, oldIndex, newIndex);
      // 自分を除いた順序を保存
      setCustomOrder(newOrder.filter((id) => id !== selfAccount?.username));
      setSortBy('manual');
    }
  };

  return (
    <div>
      {/* ソートセレクター */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-[color:var(--color-text-muted)]">
          ドラッグで並び替え可能
        </p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[color:var(--color-text-muted)]">並び替え:</span>
          <select
            value={sortBy}
            onChange={(e) => {
              setSortBy(e.target.value as SortOption | 'manual');
              if (e.target.value !== 'manual') {
                setCustomOrder([]);
              }
            }}
            className="rounded-md border border-[color:var(--color-border)] bg-white px-2 py-1 text-xs text-[color:var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
            {customOrder.length > 0 && (
              <option value="manual">カスタム順</option>
            )}
          </select>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={accountIds} strategy={rectSortingStrategy}>
          <div className="grid gap-4 sm:grid-cols-2">
            {sortedAccounts.map((account) => (
              <SortableAccountCard
                key={account.username}
                id={account.username}
                account={account}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
