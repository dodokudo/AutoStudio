export type ThreadsAccountKey = 'main' | 'sub' | 'all';

export type ThreadsConcreteAccountKey = Exclude<ThreadsAccountKey, 'all'>;

export type ThreadsAccount = {
  key: ThreadsConcreteAccountKey;
  label: string;
  handle: string;
  threadsUserId: string;
  launchkitSlugPrefixes: string[];
  lineSourceNames: string[];
};

export const THREADS_ACCOUNTS: ThreadsAccount[] = [
  {
    key: 'main',
    label: '本垢',
    handle: 'kudooo_ai',
    threadsUserId: '10012809578833342',
    launchkitSlugPrefixes: [
      // 既存導線（過去リンクからの流入も継続集計）
      'opt-4',
      '6mth',
      'm6thk',
      '6mthp',
      // 2026-08-29以降の新導線（末尾1あり＝メイン）
      '8m1',
      '8mpo1',
      '8mth1',
    ],
    lineSourceNames: ['Threads Main', 'Threads メイン'],
  },
  {
    key: 'sub',
    label: 'サブ垢',
    handle: 'kudooo_aii',
    threadsUserId: '27016191458061252',
    launchkitSlugPrefixes: [
      // 既存導線（過去リンクからの流入も継続集計）
      'opt-sub4',
      // 2026-08-29以降の新導線（末尾1なし＝サブ）
      '8m',
      '8mpo',
      '8mth',
    ],
    lineSourceNames: [
      'Threads ポスト',
      'Threads 固定',
      'Threads プロフ',
      'Threads Sub',
      'Threads サブ',
      'Threads sub',
    ],
  },
];

export const THREADS_ACCOUNT_OPTIONS = [
  ...THREADS_ACCOUNTS,
  {
    key: 'all' as const,
    label: '合算',
    handle: 'all',
    threadsUserId: '',
    launchkitSlugPrefixes: THREADS_ACCOUNTS.flatMap((account) => account.launchkitSlugPrefixes),
    // 合算では親流入名のprefixでThreads配下をすべて拾う。
    lineSourceNames: ['Threads'],
  },
];

export function resolveThreadsAccountKey(value: unknown): ThreadsAccountKey {
  return value === 'main' || value === 'sub' ? value : 'all';
}

export function getThreadsAccount(key: ThreadsAccountKey) {
  return THREADS_ACCOUNT_OPTIONS.find((account) => account.key === key) ?? THREADS_ACCOUNT_OPTIONS[0];
}

export function getThreadsUserIdsForAccount(key: ThreadsAccountKey): string[] {
  if (key === 'all') {
    return THREADS_ACCOUNTS.map((account) => account.threadsUserId);
  }
  const account = THREADS_ACCOUNTS.find((item) => item.key === key);
  return account ? [account.threadsUserId] : [THREADS_ACCOUNTS[0].threadsUserId];
}

export function getLaunchkitSlugPrefixesForAccount(key: ThreadsAccountKey): string[] {
  return getThreadsAccount(key).launchkitSlugPrefixes;
}

export function getLineSourceNamesForAccount(key: ThreadsAccountKey): string[] {
  return getThreadsAccount(key).lineSourceNames;
}
