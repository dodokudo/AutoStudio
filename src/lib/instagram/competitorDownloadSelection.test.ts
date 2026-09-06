import assert from 'node:assert/strict';
import test from 'node:test';
import { selectCompetitorDownloads } from './competitorDownloadSelection';

test('keeps a minimum from every account and fills the rest by views', () => {
  const candidates = [
    ...Array.from({ length: 10 }, (_, index) => ({
      instagramMediaId: `large-${index}`,
      postedAt: `2026-09-${String(index + 1).padStart(2, '0')}`,
      username: 'large',
      viewCount: 100_000 - index,
    })),
    ...Array.from({ length: 10 }, (_, index) => ({
      instagramMediaId: `small-${index}`,
      postedAt: `2026-09-${String(index + 1).padStart(2, '0')}`,
      username: 'small',
      viewCount: 1_000 - index,
    })),
  ];

  const selected = selectCompetitorDownloads(candidates, 10, 3);
  assert.equal(selected.length, 10);
  assert.equal(selected.filter((row) => row.username === 'small').length, 3);
  assert.equal(selected.filter((row) => row.username === 'large').length, 7);
});

test('deduplicates media IDs', () => {
  const duplicate = {
    instagramMediaId: 'same',
    postedAt: '2026-09-01',
    username: 'one',
    viewCount: 10,
  };
  assert.equal(selectCompetitorDownloads([duplicate, duplicate], 10, 1).length, 1);
});
