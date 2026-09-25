/**
 * Competitor research store (BigQuery).
 *
 * Kept in its own tables rather than mixed into threads_posts: these rows describe
 * other people's accounts and carry no owner insights.
 *
 * Posts and thread nodes are retained across collection runs. Incoming IDs are
 * replaced in small batches, while older rows outside the requested date range are
 * preserved. This avoids the MERGE-reports-success-but-does-not-apply behaviour
 * seen elsewhere in this project without losing historical research data.
 */

import { createBigQueryClient, resolveProjectId } from '@/lib/bigquery';
import { selectSelfReplyTreeNodeIds } from '@/lib/threadsReplyTree';

const projectId = resolveProjectId();
const bigquery = createBigQueryClient(projectId);
const DATASET = 'autostudio_threads';
export const THREADS_RESEARCH_OWNER_ID = 'autostudio';
const T_WATCHLIST = `\`${projectId}.${DATASET}.research_watchlist\``;
const T_PROFILES = `\`${projectId}.${DATASET}.research_profiles\``;
const T_POSTS = `\`${projectId}.${DATASET}.research_posts\``;
const T_NODES = `\`${projectId}.${DATASET}.research_thread_nodes\``;

async function executeDML(options: {
  query: string;
  params?: Record<string, unknown>;
  types?: Record<string, string>;
}): Promise<void> {
  const [job] = await bigquery.createQueryJob(options);
  await job.getQueryResults();
}

let ensureTablesPromise: Promise<void> | null = null;

/** Create missing research tables. Existing tables are checked without issuing DDL. */
export async function ensureResearchTables(): Promise<void> {
  if (!ensureTablesPromise) {
    ensureTablesPromise = (async () => {
      const statements = [
        {
          table: 'research_watchlist',
          query: `CREATE TABLE IF NOT EXISTS ${T_WATCHLIST} (
          user_id STRING NOT NULL,
          username STRING NOT NULL,
          note STRING,
          is_active BOOL,
          added_at TIMESTAMP,
          last_collected_at TIMESTAMP,
          last_error STRING
        )`,
        },
        {
          table: 'research_profiles',
          query: `CREATE TABLE IF NOT EXISTS ${T_PROFILES} (
          user_id STRING NOT NULL,
          username STRING NOT NULL,
          snapshot_date DATE NOT NULL,
          name STRING,
          biography STRING,
          profile_picture_url STRING,
          is_verified BOOL,
          follower_count INT64,
          likes_count INT64,
          replies_count INT64,
          reposts_count INT64,
          quotes_count INT64,
          views_count INT64,
          collected_at TIMESTAMP
        )
        PARTITION BY snapshot_date`,
        },
        {
          table: 'research_posts',
          query: `CREATE TABLE IF NOT EXISTS ${T_POSTS} (
          user_id STRING NOT NULL,
          username STRING NOT NULL,
          post_id STRING NOT NULL,
          text STRING,
          posted_at TIMESTAMP,
          permalink STRING,
          media_type STRING,
          is_quote_post BOOL,
          has_replies BOOL,
          text_length INT64,
          self_reply_count INT64,
          max_depth INT64,
          other_reply_count INT64,
          conversation_scanned BOOL,
          collected_at TIMESTAMP
        )`,
        },
        {
          table: 'research_thread_nodes',
          query: `CREATE TABLE IF NOT EXISTS ${T_NODES} (
          user_id STRING NOT NULL,
          username STRING NOT NULL,
          root_post_id STRING NOT NULL,
          node_id STRING NOT NULL,
          node_username STRING,
          text STRING,
          posted_at TIMESTAMP,
          permalink STRING,
          parent_id STRING,
          depth INT64,
          is_self_reply BOOL,
          text_length INT64,
          seconds_after_root INT64,
          collected_at TIMESTAMP
        )`,
        },
      ];

      const dataset = bigquery.dataset(DATASET);
      const existence = await Promise.all(
        statements.map(({ table }) => dataset.table(table).exists())
      );
      for (const [index, statement] of statements.entries()) {
        if (!existence[index][0]) await executeDML({ query: statement.query });
      }
      await executeDML({
        query: `ALTER TABLE ${T_POSTS} ADD COLUMN IF NOT EXISTS conversation_scanned BOOL`,
      });
    })().catch((error) => {
      ensureTablesPromise = null; // let a later call retry
      throw error;
    });
  }

  return ensureTablesPromise;
}

export interface WatchlistEntry {
  username: string;
  note: string | null;
  isActive: boolean;
  addedAt: string | null;
  lastCollectedAt: string | null;
  lastError: string | null;
}

function toIso(value: unknown): string | null {
  if (!value) return null;
  const raw =
    typeof value === 'object' && value !== null && 'value' in value
      ? (value as { value?: unknown }).value
      : value;
  if (!raw) return null;
  const date = raw instanceof Date ? raw : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Normalise however the user typed it: @name, a profile URL, or bare username. */
export function normalizeUsername(input: string): string {
  return input
    .trim()
    .replace(/^https?:\/\/(www\.)?threads\.(net|com)\//i, '')
    .replace(/^@/, '')
    .split(/[/?#]/)[0]
    .toLowerCase();
}

export async function listWatchlist(userId: string): Promise<WatchlistEntry[]> {
  await ensureResearchTables();
  const [rows] = await bigquery.query({
    query: `
      SELECT username, note, is_active, added_at, last_collected_at, last_error
      FROM ${T_WATCHLIST}
      WHERE user_id = @userId
      ORDER BY added_at DESC
    `,
    params: { userId },
  });

  return (rows as Record<string, unknown>[]).map((row) => ({
    username: String(row.username),
    note: (row.note as string) ?? null,
    isActive: row.is_active !== false,
    addedAt: toIso(row.added_at),
    lastCollectedAt: toIso(row.last_collected_at),
    lastError: (row.last_error as string) ?? null,
  }));
}

export async function addToWatchlist(
  userId: string,
  username: string,
  note: string
): Promise<void> {
  await ensureResearchTables();
  const clean = normalizeUsername(username);

  // Replace rather than guard with an existence check: re-adding should reset state.
  await executeDML({
    query: `DELETE FROM ${T_WATCHLIST} WHERE user_id = @userId AND username = @username`,
    params: { userId, username: clean },
  });
  await executeDML({
    query: `
      INSERT INTO ${T_WATCHLIST}
        (user_id, username, note, is_active, added_at, last_collected_at, last_error)
      VALUES (@userId, @username, @note, TRUE, CURRENT_TIMESTAMP(), NULL, NULL)
    `,
    params: { userId, username: clean, note: note || null },
    types: { userId: 'STRING', username: 'STRING', note: 'STRING' },
  });
}

export async function removeFromWatchlist(userId: string, username: string): Promise<void> {
  await ensureResearchTables();
  const clean = normalizeUsername(username);
  const params = { userId, username: clean };

  await executeDML({
    query: `DELETE FROM ${T_WATCHLIST} WHERE user_id = @userId AND username = @username`,
    params,
  });
  await executeDML({
    query: `DELETE FROM ${T_POSTS} WHERE user_id = @userId AND username = @username`,
    params,
  });
  await executeDML({
    query: `DELETE FROM ${T_NODES} WHERE user_id = @userId AND username = @username`,
    params,
  });
  await executeDML({
    query: `DELETE FROM ${T_PROFILES} WHERE user_id = @userId AND username = @username`,
    params,
  });
}

export async function markCollected(
  userId: string,
  username: string,
  error: string | null
): Promise<void> {
  await executeDML({
    query: `
      UPDATE ${T_WATCHLIST}
      SET last_collected_at = CURRENT_TIMESTAMP(), last_error = @error
      WHERE user_id = @userId AND username = @username
    `,
    params: { userId, username: normalizeUsername(username), error },
    types: { userId: 'STRING', username: 'STRING', error: 'STRING' },
  });
}

export interface ProfileSnapshotInput {
  username: string;
  name?: string;
  biography?: string;
  profilePictureUrl?: string;
  isVerified?: boolean;
  followerCount?: number;
  likesCount?: number;
  repliesCount?: number;
  repostsCount?: number;
  quotesCount?: number;
  viewsCount?: number;
}

/** One row per account per day. Re-running on the same day overwrites that day. */
export async function saveProfileSnapshot(
  userId: string,
  profile: ProfileSnapshotInput
): Promise<void> {
  const username = normalizeUsername(profile.username);

  await executeDML({
    query: `
      DELETE FROM ${T_PROFILES}
      WHERE user_id = @userId
        AND username = @username
        AND snapshot_date = CURRENT_DATE('Asia/Tokyo')
    `,
    params: { userId, username },
  });

  await executeDML({
    query: `
      INSERT INTO ${T_PROFILES} (
        user_id, username, snapshot_date, name, biography, profile_picture_url,
        is_verified, follower_count, likes_count, replies_count, reposts_count,
        quotes_count, views_count, collected_at
      )
      VALUES (
        @userId, @username, CURRENT_DATE('Asia/Tokyo'), @name, @biography, @pictureUrl,
        @isVerified, @followerCount, @likesCount, @repliesCount, @repostsCount,
        @quotesCount, @viewsCount, CURRENT_TIMESTAMP()
      )
    `,
    params: {
      userId,
      username,
      name: profile.name ?? null,
      biography: profile.biography ?? null,
      pictureUrl: profile.profilePictureUrl ?? null,
      isVerified: profile.isVerified ?? null,
      followerCount: profile.followerCount ?? null,
      likesCount: profile.likesCount ?? null,
      repliesCount: profile.repliesCount ?? null,
      repostsCount: profile.repostsCount ?? null,
      quotesCount: profile.quotesCount ?? null,
      viewsCount: profile.viewsCount ?? null,
    },
    types: {
      userId: 'STRING',
      username: 'STRING',
      name: 'STRING',
      biography: 'STRING',
      pictureUrl: 'STRING',
      isVerified: 'BOOL',
      followerCount: 'INT64',
      likesCount: 'INT64',
      repliesCount: 'INT64',
      repostsCount: 'INT64',
      quotesCount: 'INT64',
      viewsCount: 'INT64',
    },
  });
}

export interface PostRow {
  postId: string;
  text: string;
  postedAt: string;
  permalink: string;
  mediaType: string;
  isQuotePost: boolean;
  hasReplies: boolean;
  selfReplyCount: number;
  maxDepth: number;
  otherReplyCount: number;
  conversationScanned: boolean;
}

export interface NodeRow {
  rootPostId: string;
  nodeId: string;
  nodeUsername: string;
  text: string;
  postedAt: string;
  permalink: string;
  parentId: string | null;
  depth: number;
  isSelfReply: boolean;
  secondsAfterRoot: number | null;
}

/**
 * Upsert one account's collected posts and thread nodes in a single pass.
 * Values are inlined as parameters via UNION ALL, in batches, mirroring how
 * lib/bigquery.ts batches its own writes. Only incoming IDs are replaced; rows
 * outside the requested collection window remain stored.
 */
export async function upsertAccountData(
  userId: string,
  username: string,
  posts: PostRow[],
  nodes: NodeRow[]
): Promise<void> {
  const clean = normalizeUsername(username);
  // BigQuery DML jobs have noticeable per-query overhead. A 200-row batch keeps
  // the parameterised query comfortably below size limits while making a
  // six-month backfill practical.
  const BATCH = 200;

  for (let i = 0; i < posts.length; i += BATCH) {
    const batch = posts.slice(i, i + BATCH);
    const values = batch
      .map(
        (_, idx) => `
        SELECT @userId AS user_id, @username AS username, @postId_${idx} AS post_id,
          @text_${idx} AS text, TIMESTAMP(@postedAt_${idx}) AS posted_at,
          @permalink_${idx} AS permalink, @mediaType_${idx} AS media_type,
          @isQuotePost_${idx} AS is_quote_post, @hasReplies_${idx} AS has_replies,
          @textLength_${idx} AS text_length, @selfReplyCount_${idx} AS self_reply_count,
          @maxDepth_${idx} AS max_depth, @otherReplyCount_${idx} AS other_reply_count,
          @conversationScanned_${idx} AS conversation_scanned,
          CURRENT_TIMESTAMP() AS collected_at
      `
      )
      .join(' UNION ALL ');

    const batchParams: Record<string, unknown> = { userId, username: clean };
    const batchTypes: Record<string, string> = { userId: 'STRING', username: 'STRING' };

    batch.forEach((post, idx) => {
      batchParams[`postId_${idx}`] = post.postId;
      batchParams[`text_${idx}`] = post.text;
      batchParams[`postedAt_${idx}`] = post.postedAt;
      batchParams[`permalink_${idx}`] = post.permalink;
      batchParams[`mediaType_${idx}`] = post.mediaType;
      batchParams[`isQuotePost_${idx}`] = post.isQuotePost;
      batchParams[`hasReplies_${idx}`] = post.hasReplies;
      batchParams[`textLength_${idx}`] = [...post.text].length;
      batchParams[`selfReplyCount_${idx}`] = post.selfReplyCount;
      batchParams[`maxDepth_${idx}`] = post.maxDepth;
      batchParams[`otherReplyCount_${idx}`] = post.otherReplyCount;
      batchParams[`conversationScanned_${idx}`] = post.conversationScanned;
      batchTypes[`textLength_${idx}`] = 'INT64';
      batchTypes[`selfReplyCount_${idx}`] = 'INT64';
      batchTypes[`maxDepth_${idx}`] = 'INT64';
      batchTypes[`otherReplyCount_${idx}`] = 'INT64';
    });

    const deletePostParams: Record<string, unknown> = { userId, username: clean };
    const deletePostTypes: Record<string, string> = { userId: 'STRING', username: 'STRING' };
    batch.forEach((post, idx) => {
      deletePostParams[`postId_${idx}`] = post.postId;
      deletePostTypes[`postId_${idx}`] = 'STRING';
    });

    await executeDML({
      query: `
        DELETE FROM ${T_POSTS}
        WHERE user_id = @userId AND username = @username
          AND post_id IN (${batch.map((_, idx) => `@postId_${idx}`).join(', ')})
      `,
      params: deletePostParams,
      types: deletePostTypes,
    });

    const scannedPosts = batch.filter((post) => post.conversationScanned);
    if (scannedPosts.length > 0) {
      const deleteNodeParams: Record<string, unknown> = { userId, username: clean };
      const deleteNodeTypes: Record<string, string> = { userId: 'STRING', username: 'STRING' };
      scannedPosts.forEach((post, idx) => {
        deleteNodeParams[`rootPostId_${idx}`] = post.postId;
        deleteNodeTypes[`rootPostId_${idx}`] = 'STRING';
      });
      await executeDML({
        query: `
          DELETE FROM ${T_NODES}
          WHERE user_id = @userId AND username = @username
            AND root_post_id IN (${scannedPosts.map((_, idx) => `@rootPostId_${idx}`).join(', ')})
        `,
        params: deleteNodeParams,
        types: deleteNodeTypes,
      });
    }

    await executeDML({
      query: `
        INSERT INTO ${T_POSTS} (
          user_id, username, post_id, text, posted_at, permalink, media_type,
          is_quote_post, has_replies, text_length, self_reply_count, max_depth,
          other_reply_count, conversation_scanned, collected_at
        )
        ${values}
      `,
      params: batchParams,
      types: batchTypes,
    });
  }

  for (let i = 0; i < nodes.length; i += BATCH) {
    const batch = nodes.slice(i, i + BATCH);
    const values = batch
      .map(
        (_, idx) => `
        SELECT @userId AS user_id, @username AS username, @rootPostId_${idx} AS root_post_id,
          @nodeId_${idx} AS node_id, @nodeUsername_${idx} AS node_username, @text_${idx} AS text,
          TIMESTAMP(@postedAt_${idx}) AS posted_at, @permalink_${idx} AS permalink,
          @parentId_${idx} AS parent_id, @depth_${idx} AS depth,
          @isSelfReply_${idx} AS is_self_reply, @textLength_${idx} AS text_length,
          @secondsAfterRoot_${idx} AS seconds_after_root, CURRENT_TIMESTAMP() AS collected_at
      `
      )
      .join(' UNION ALL ');

    const batchParams: Record<string, unknown> = { userId, username: clean };
    const batchTypes: Record<string, string> = { userId: 'STRING', username: 'STRING' };

    batch.forEach((node, idx) => {
      batchParams[`rootPostId_${idx}`] = node.rootPostId;
      batchParams[`nodeId_${idx}`] = node.nodeId;
      batchParams[`nodeUsername_${idx}`] = node.nodeUsername;
      batchParams[`text_${idx}`] = node.text;
      batchParams[`postedAt_${idx}`] = node.postedAt;
      batchParams[`permalink_${idx}`] = node.permalink;
      batchParams[`parentId_${idx}`] = node.parentId;
      batchParams[`depth_${idx}`] = node.depth;
      batchParams[`isSelfReply_${idx}`] = node.isSelfReply;
      batchParams[`textLength_${idx}`] = [...node.text].length;
      batchParams[`secondsAfterRoot_${idx}`] = node.secondsAfterRoot;
      batchTypes[`parentId_${idx}`] = 'STRING';
      batchTypes[`depth_${idx}`] = 'INT64';
      batchTypes[`textLength_${idx}`] = 'INT64';
      batchTypes[`secondsAfterRoot_${idx}`] = 'INT64';
    });

    const deleteNodeParams: Record<string, unknown> = { userId, username: clean };
    const deleteNodeTypes: Record<string, string> = { userId: 'STRING', username: 'STRING' };
    batch.forEach((node, idx) => {
      deleteNodeParams[`nodeId_${idx}`] = node.nodeId;
      deleteNodeTypes[`nodeId_${idx}`] = 'STRING';
    });

    await executeDML({
      query: `
        DELETE FROM ${T_NODES}
        WHERE user_id = @userId AND username = @username
          AND node_id IN (${batch.map((_, idx) => `@nodeId_${idx}`).join(', ')})
      `,
      params: deleteNodeParams,
      types: deleteNodeTypes,
    });

    await executeDML({
      query: `
        INSERT INTO ${T_NODES} (
          user_id, username, root_post_id, node_id, node_username, text, posted_at,
          permalink, parent_id, depth, is_self_reply, text_length, seconds_after_root,
          collected_at
        )
        ${values}
      `,
      params: batchParams,
      types: batchTypes,
    });
  }
}

export interface AccountSummary {
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  followerCount: number | null;
  viewsCount: number | null;
  likesCount: number | null;
  repliesCount: number | null;
  repostsCount: number | null;
  quotesCount: number | null;
  postCount: number;
  treePostCount: number;
  scannedPostCount: number;
  avgSelfReplies: number | null;
  avgTextLength: number | null;
  latestPostAt: string | null;
}

export interface ProfileHistoryPoint {
  username: string;
  snapshotDate: string;
  collectedAt: string | null;
  followerCount: number | null;
  viewsCount: number | null;
  likesCount: number | null;
  repliesCount: number | null;
  repostsCount: number | null;
  quotesCount: number | null;
}

export interface DailyPostCount {
  username: string;
  /** Post date in JST (YYYY-MM-DD). */
  postDate: string;
  postCount: number;
}

/** Number of root posts per account per JST day (quotes excluded). */
export async function getDailyPostCounts(
  userId: string,
  days = 90
): Promise<DailyPostCount[]> {
  await ensureResearchTables();
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  const [rows] = await bigquery.query({
    query: `
      SELECT
        username,
        CAST(DATE(posted_at, 'Asia/Tokyo') AS STRING) AS post_date,
        COUNT(*) AS post_count
      FROM ${T_POSTS}
      WHERE user_id = @userId
        AND NOT IFNULL(is_quote_post, FALSE)
        AND DATE(posted_at, 'Asia/Tokyo') >= DATE_SUB(
          CURRENT_DATE('Asia/Tokyo'),
          INTERVAL ${safeDays - 1} DAY
        )
      GROUP BY username, post_date
      ORDER BY post_date, username
    `,
    params: { userId },
  });
  return (rows as Record<string, unknown>[]).map((row) => ({
    username: String(row.username),
    postDate: String(row.post_date),
    postCount: Number(row.post_count ?? 0),
  }));
}

/** Daily rolling-seven-day profile snapshots, oldest first for charting. */
export async function getProfileHistory(
  userId: string,
  days = 90
): Promise<ProfileHistoryPoint[]> {
  await ensureResearchTables();
  const safeDays = Math.max(1, Math.min(365, Math.floor(days)));
  const [rows] = await bigquery.query({
    query: `
      SELECT
        username,
        CAST(snapshot_date AS STRING) AS snapshot_date,
        collected_at,
        follower_count,
        views_count,
        likes_count,
        replies_count,
        reposts_count,
        quotes_count
      FROM ${T_PROFILES}
      WHERE user_id = @userId
        AND snapshot_date >= DATE_SUB(
          CURRENT_DATE('Asia/Tokyo'),
          INTERVAL ${safeDays - 1} DAY
        )
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY username, snapshot_date
        ORDER BY collected_at DESC
      ) = 1
      ORDER BY snapshot_date, username
    `,
    params: { userId },
  });

  return (rows as Record<string, unknown>[]).map((row) => ({
    username: String(row.username),
    snapshotDate: String(row.snapshot_date),
    collectedAt: toIso(row.collected_at),
    followerCount: row.follower_count === null ? null : Number(row.follower_count),
    viewsCount: row.views_count === null ? null : Number(row.views_count),
    likesCount: row.likes_count === null ? null : Number(row.likes_count),
    repliesCount: row.replies_count === null ? null : Number(row.replies_count),
    repostsCount: row.reposts_count === null ? null : Number(row.reposts_count),
    quotesCount: row.quotes_count === null ? null : Number(row.quotes_count),
  }));
}

/** One row per watched account, joining the latest profile snapshot to post aggregates. */
export async function getAccountSummaries(userId: string): Promise<AccountSummary[]> {
  await ensureResearchTables();
  const [rows] = await bigquery.query({
    query: `
      WITH RECURSIVE self_reply_tree AS (
        SELECT user_id, username, root_post_id, node_id, parent_id, depth
        FROM ${T_NODES}
        WHERE user_id = @userId
          AND is_self_reply IS TRUE
          AND parent_id = root_post_id
        UNION ALL
        SELECT n.user_id, n.username, n.root_post_id, n.node_id, n.parent_id, n.depth
        FROM ${T_NODES} n
        JOIN self_reply_tree tree
          ON n.user_id = tree.user_id
          AND n.username = tree.username
          AND n.root_post_id = tree.root_post_id
          AND n.parent_id = tree.node_id
        WHERE n.is_self_reply IS TRUE
      ),
      tree_stats AS (
        SELECT username, root_post_id, COUNT(*) AS reply_count, MAX(depth) AS max_depth
        FROM self_reply_tree
        GROUP BY username, root_post_id
      ),
      latest_profile AS (
        SELECT * EXCEPT(rn) FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY username ORDER BY snapshot_date DESC) AS rn
          FROM ${T_PROFILES}
          WHERE user_id = @userId
        ) WHERE rn = 1
      ),
      post_stats AS (
        SELECT
          p.username,
          COUNT(*) AS post_count,
          COUNTIF(IFNULL(t.reply_count, 0) > 0) AS tree_post_count,
          COUNTIF(p.conversation_scanned IS TRUE) AS scanned_post_count,
          AVG(IFNULL(t.reply_count, 0)) AS avg_self_replies,
          AVG(p.text_length) AS avg_text_length,
          MAX(p.posted_at) AS latest_post_at
        FROM ${T_POSTS} p
        LEFT JOIN tree_stats t
          ON t.username = p.username AND t.root_post_id = p.post_id
        WHERE p.user_id = @userId
        GROUP BY p.username
      )
      SELECT
        w.username,
        p.name,
        p.profile_picture_url,
        p.follower_count,
        p.views_count,
        p.likes_count,
        p.replies_count,
        p.reposts_count,
        p.quotes_count,
        IFNULL(s.post_count, 0) AS post_count,
        IFNULL(s.tree_post_count, 0) AS tree_post_count,
        IFNULL(s.scanned_post_count, 0) AS scanned_post_count,
        s.avg_self_replies,
        s.avg_text_length,
        s.latest_post_at
      FROM ${T_WATCHLIST} w
      LEFT JOIN latest_profile p ON p.username = w.username
      LEFT JOIN post_stats s ON s.username = w.username
      WHERE w.user_id = @userId AND w.is_active
      ORDER BY p.follower_count DESC NULLS LAST, w.username
    `,
    params: { userId },
  });

  return (rows as Record<string, unknown>[]).map((row) => ({
    username: String(row.username),
    name: (row.name as string) ?? null,
    profilePictureUrl: (row.profile_picture_url as string) ?? null,
    followerCount: row.follower_count === null ? null : Number(row.follower_count),
    viewsCount: row.views_count === null ? null : Number(row.views_count),
    likesCount: row.likes_count === null ? null : Number(row.likes_count),
    repliesCount: row.replies_count === null ? null : Number(row.replies_count),
    repostsCount: row.reposts_count === null ? null : Number(row.reposts_count),
    quotesCount: row.quotes_count === null ? null : Number(row.quotes_count),
    postCount: Number(row.post_count ?? 0),
    treePostCount: Number(row.tree_post_count ?? 0),
    scannedPostCount: Number(row.scanned_post_count ?? 0),
    avgSelfReplies: row.avg_self_replies === null ? null : Number(row.avg_self_replies),
    avgTextLength: row.avg_text_length === null ? null : Number(row.avg_text_length),
    latestPostAt: toIso(row.latest_post_at),
  }));
}

export interface ResearchPost extends PostRow {
  username: string;
}

export async function getPosts(
  userId: string,
  options: {
    username?: string;
    limit?: number;
    treeOnly?: boolean;
    since?: string;
    until?: string;
  } = {}
): Promise<ResearchPost[]> {
  await ensureResearchTables();
  const [rows] = await bigquery.query({
    query: `
      WITH RECURSIVE self_reply_tree AS (
        SELECT user_id, username, root_post_id, node_id, parent_id, depth
        FROM ${T_NODES}
        WHERE user_id = @userId
          AND (@username IS NULL OR username = @username)
          AND is_self_reply IS TRUE
          AND parent_id = root_post_id
        UNION ALL
        SELECT n.user_id, n.username, n.root_post_id, n.node_id, n.parent_id, n.depth
        FROM ${T_NODES} n
        JOIN self_reply_tree tree
          ON n.user_id = tree.user_id
          AND n.username = tree.username
          AND n.root_post_id = tree.root_post_id
          AND n.parent_id = tree.node_id
        WHERE n.is_self_reply IS TRUE
      ),
      tree_stats AS (
        SELECT username, root_post_id, COUNT(*) AS reply_count, MAX(depth) AS max_depth
        FROM self_reply_tree
        GROUP BY username, root_post_id
      )
      SELECT p.username, p.post_id, p.text, p.posted_at, p.permalink, p.media_type,
             p.is_quote_post, p.has_replies,
             IFNULL(t.reply_count, 0) AS self_reply_count,
             IFNULL(t.max_depth, 0) AS max_depth,
             p.other_reply_count, p.conversation_scanned
      FROM ${T_POSTS} p
      LEFT JOIN tree_stats t
        ON t.username = p.username AND t.root_post_id = p.post_id
      WHERE p.user_id = @userId
        AND (@username IS NULL OR p.username = @username)
        AND (NOT @treeOnly OR IFNULL(t.reply_count, 0) > 0)
        AND (@since IS NULL OR p.posted_at >= TIMESTAMP(@since))
        AND (@until IS NULL OR p.posted_at <= TIMESTAMP(@until))
      ORDER BY p.posted_at DESC
      LIMIT @limit
    `,
    params: {
      userId,
      username: options.username ? normalizeUsername(options.username) : null,
      treeOnly: options.treeOnly ?? false,
      since: options.since ?? null,
      until: options.until ?? null,
      limit: options.limit ?? 100,
    },
    types: {
      userId: 'STRING',
      username: 'STRING',
      treeOnly: 'BOOL',
      since: 'STRING',
      until: 'STRING',
      limit: 'INT64',
    },
  });

  return (rows as Record<string, unknown>[]).map((row) => ({
    username: String(row.username),
    postId: String(row.post_id),
    text: (row.text as string) ?? '',
    postedAt: toIso(row.posted_at) ?? '',
    permalink: (row.permalink as string) ?? '',
    mediaType: (row.media_type as string) ?? '',
    isQuotePost: Boolean(row.is_quote_post),
    hasReplies: Boolean(row.has_replies),
    selfReplyCount: Number(row.self_reply_count ?? 0),
    maxDepth: Number(row.max_depth ?? 0),
    otherReplyCount: Number(row.other_reply_count ?? 0),
    conversationScanned: Boolean(row.conversation_scanned),
  }));
}

export interface ResearchNode extends NodeRow {
  username: string;
}

function markTrueSelfReplyTree(nodes: ResearchNode[]): ResearchNode[] {
  const grouped = new Map<string, ResearchNode[]>();
  for (const node of nodes) {
    const siblings = grouped.get(node.rootPostId) ?? [];
    siblings.push(node);
    grouped.set(node.rootPostId, siblings);
  }

  const treeNodeIds = new Set<string>();
  for (const [rootPostId, rootNodes] of grouped) {
    const selected = selectSelfReplyTreeNodeIds(
      rootPostId,
      rootNodes[0]?.username ?? '',
      rootNodes.map((node) => ({
        id: node.nodeId,
        username: node.nodeUsername,
        parentId: node.parentId,
      }))
    );
    for (const nodeId of selected) treeNodeIds.add(nodeId);
  }

  return nodes.map((node) => ({ ...node, isSelfReply: treeNodeIds.has(node.nodeId) }));
}

/** The self-reply chain under one post, oldest first - reading order. */
export async function getThreadNodes(
  userId: string,
  rootPostId: string
): Promise<ResearchNode[]> {
  await ensureResearchTables();
  const [rows] = await bigquery.query({
    query: `
      SELECT username, root_post_id, node_id, node_username, text, posted_at, permalink,
             parent_id, depth, is_self_reply, seconds_after_root
      FROM ${T_NODES}
      WHERE user_id = @userId AND root_post_id = @rootPostId
      ORDER BY is_self_reply DESC, depth, posted_at
    `,
    params: { userId, rootPostId },
  });

  return markTrueSelfReplyTree((rows as Record<string, unknown>[]).map((row) => ({
    username: String(row.username),
    rootPostId: String(row.root_post_id),
    nodeId: String(row.node_id),
    nodeUsername: String(row.node_username ?? ''),
    text: (row.text as string) ?? '',
    postedAt: toIso(row.posted_at) ?? '',
    permalink: (row.permalink as string) ?? '',
    parentId: (row.parent_id as string) ?? null,
    depth: Number(row.depth ?? 0),
    isSelfReply: Boolean(row.is_self_reply),
    secondsAfterRoot:
      row.seconds_after_root === null ? null : Number(row.seconds_after_root),
  })));
}

/** All saved nodes for one account, grouped by root post on the client or in analysis. */
export async function getAccountThreadNodes(
  userId: string,
  username: string
): Promise<ResearchNode[]> {
  await ensureResearchTables();
  const [rows] = await bigquery.query({
    query: `
      SELECT username, root_post_id, node_id, node_username, text, posted_at, permalink,
             parent_id, depth, is_self_reply, seconds_after_root
      FROM ${T_NODES}
      WHERE user_id = @userId AND username = @username
      ORDER BY root_post_id, is_self_reply DESC, depth, posted_at
    `,
    params: { userId, username: normalizeUsername(username) },
  });

  return markTrueSelfReplyTree((rows as Record<string, unknown>[]).map((row) => ({
    username: String(row.username),
    rootPostId: String(row.root_post_id),
    nodeId: String(row.node_id),
    nodeUsername: String(row.node_username ?? ''),
    text: (row.text as string) ?? '',
    postedAt: toIso(row.posted_at) ?? '',
    permalink: (row.permalink as string) ?? '',
    parentId: (row.parent_id as string) ?? null,
    depth: Number(row.depth ?? 0),
    isSelfReply: Boolean(row.is_self_reply),
    secondsAfterRoot:
      row.seconds_after_root === null ? null : Number(row.seconds_after_root),
  })));
}

export interface ResearchInsights {
  hourHistogram: { hour: number; postCount: number }[];
  depthHistogram: { depth: number; postCount: number }[];
  lengthBuckets: { bucket: string; postCount: number }[];
}

/** Aggregates that answer "how do these accounts construct posts". */
export async function getInsights(
  userId: string,
  username?: string
): Promise<ResearchInsights> {
  await ensureResearchTables();
  const params = {
    userId,
    username: username ? normalizeUsername(username) : null,
  };
  const types = { userId: 'STRING', username: 'STRING' };

  const [hourRows] = await bigquery.query({
    query: `
      SELECT EXTRACT(HOUR FROM posted_at AT TIME ZONE 'Asia/Tokyo') AS hour, COUNT(*) AS post_count
      FROM ${T_POSTS}
      WHERE user_id = @userId AND (@username IS NULL OR username = @username)
      GROUP BY hour ORDER BY hour
    `,
    params,
    types,
  });

  const [depthRows] = await bigquery.query({
    query: `
      WITH RECURSIVE self_reply_tree AS (
        SELECT user_id, username, root_post_id, node_id, parent_id, depth
        FROM ${T_NODES}
        WHERE user_id = @userId
          AND (@username IS NULL OR username = @username)
          AND is_self_reply IS TRUE
          AND parent_id = root_post_id
        UNION ALL
        SELECT n.user_id, n.username, n.root_post_id, n.node_id, n.parent_id, n.depth
        FROM ${T_NODES} n
        JOIN self_reply_tree tree
          ON n.user_id = tree.user_id
          AND n.username = tree.username
          AND n.root_post_id = tree.root_post_id
          AND n.parent_id = tree.node_id
        WHERE n.is_self_reply IS TRUE
      ),
      tree_stats AS (
        SELECT username, root_post_id, COUNT(*) AS reply_count
        FROM self_reply_tree
        GROUP BY username, root_post_id
      )
      SELECT IFNULL(t.reply_count, 0) AS depth, COUNT(*) AS post_count
      FROM ${T_POSTS} p
      LEFT JOIN tree_stats t
        ON t.username = p.username AND t.root_post_id = p.post_id
      WHERE p.user_id = @userId AND (@username IS NULL OR p.username = @username)
      GROUP BY depth ORDER BY depth
    `,
    params,
    types,
  });

  const [lengthRows] = await bigquery.query({
    query: `
      SELECT
        CASE
          WHEN text_length < 100 THEN '0-99'
          WHEN text_length < 200 THEN '100-199'
          WHEN text_length < 300 THEN '200-299'
          WHEN text_length < 500 THEN '300-499'
          ELSE '500+'
        END AS bucket,
        COUNT(*) AS post_count
      FROM ${T_POSTS}
      WHERE user_id = @userId AND (@username IS NULL OR username = @username)
      GROUP BY bucket
      ORDER BY MIN(text_length)
    `,
    params,
    types,
  });

  return {
    hourHistogram: (hourRows as Record<string, unknown>[]).map((r) => ({
      hour: Number(r.hour),
      postCount: Number(r.post_count),
    })),
    depthHistogram: (depthRows as Record<string, unknown>[]).map((r) => ({
      depth: Number(r.depth),
      postCount: Number(r.post_count),
    })),
    lengthBuckets: (lengthRows as Record<string, unknown>[]).map((r) => ({
      bucket: String(r.bucket),
      postCount: Number(r.post_count),
    })),
  };
}
