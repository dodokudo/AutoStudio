export interface CompetitorDownloadCandidate {
  instagramMediaId: string;
  postedAt: string | null;
  username: string;
  viewCount: number | null;
}

function byPerformance(
  a: CompetitorDownloadCandidate,
  b: CompetitorDownloadCandidate,
): number {
  const viewDiff = (b.viewCount ?? 0) - (a.viewCount ?? 0);
  if (viewDiff !== 0) return viewDiff;
  return String(b.postedAt ?? '').localeCompare(String(a.postedAt ?? ''));
}

export function selectCompetitorDownloads<T extends CompetitorDownloadCandidate>(
  candidates: T[],
  limit: number,
  minimumPerAccount: number,
): T[] {
  if (limit <= 0 || candidates.length === 0) return [];

  const unique = new Map<string, T>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.instagramMediaId)) {
      unique.set(candidate.instagramMediaId, candidate);
    }
  }

  const byAccount = new Map<string, T[]>();
  for (const candidate of unique.values()) {
    const rows = byAccount.get(candidate.username) ?? [];
    rows.push(candidate);
    byAccount.set(candidate.username, rows);
  }
  for (const rows of byAccount.values()) rows.sort(byPerformance);

  const selected: T[] = [];
  const selectedIds = new Set<string>();
  const guaranteedPerAccount = Math.min(
    Math.max(0, minimumPerAccount),
    Math.floor(limit / byAccount.size),
  );

  for (const username of Array.from(byAccount.keys()).sort()) {
    for (const candidate of (byAccount.get(username) ?? []).slice(0, guaranteedPerAccount)) {
      selected.push(candidate);
      selectedIds.add(candidate.instagramMediaId);
    }
  }

  const remaining = Array.from(unique.values())
    .filter((candidate) => !selectedIds.has(candidate.instagramMediaId))
    .sort(byPerformance);
  selected.push(...remaining.slice(0, Math.max(0, limit - selected.length)));

  return selected.slice(0, limit);
}
