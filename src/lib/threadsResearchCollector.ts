/**
 * Runs one collection pass over the watchlist: profile snapshot, public posts,
 * and the self-reply chain under every post that has replies.
 *
 * Access-level reality (verified live against the API):
 *   - Before App Review approval, only @meta, @threads, @instagram and @facebook
 *     resolve. Everything else fails with "Application does not have permission
 *     for this action". That is surfaced per account rather than failing the run.
 *   - Per-post views/likes are never available for other people's posts, so nothing
 *     here pretends to measure reach. What it measures is construction: timing,
 *     length, tree shape, where the CTA sits.
 */

import { ThreadsDiscoveryAPI, ThreadsConversationAPI } from '@/lib/threadsDiscovery';
import { selectSelfReplyTreeNodeIds } from '@/lib/threadsReplyTree';
import {
  addToWatchlist,
  getAccountSummaries,
  listWatchlist,
  markCollected,
  normalizeUsername,
  saveProfileSnapshot,
  upsertAccountData,
  type NodeRow,
  type PostRow,
} from '@/lib/threadsResearch';
import { THREADS_RESEARCH_TARGET_USERNAMES } from '@/lib/threadsResearchTargets';

/** Meta's own accounts - the only ones readable before Advanced Access is granted. */
export const STANDARD_ACCESS_USERNAMES = ['meta', 'threads', 'instagram', 'facebook'];

const PERMISSION_ERROR = 'Application does not have permission for this action';

export interface AccountResult {
  username: string;
  ok: boolean;
  postCount: number;
  selfReplyCount: number;
  oldestPostAt: string | null;
  latestPostAt: string | null;
  error: string | null;
  needsApproval: boolean;
}

export interface CollectResult {
  results: AccountResult[];
  collectedAt: string;
}

export interface CollectionOptions {
  /** Inclusive ISO timestamp. When omitted, collection falls back to latest-N mode. */
  since?: string;
  /** Inclusive ISO timestamp. Defaults to now when `since` is set. */
  until?: string;
  /** Safety cap. Date-range collection otherwise walks until it crosses `since`. */
  maxPosts?: number;
  /** Fetch full reply conversations and retain the author's self-reply chain. */
  includeConversations?: boolean;
}

function isPermissionError(message: string): boolean {
  return message.includes(PERMISSION_ERROR) || message.includes('does not have permission');
}

/**
 * Collect one account. `maxPosts` caps the profile_posts walk; conversations are
 * only fetched for posts that report has_replies, to stay inside the shared
 * 1,000 requests / 24h budget for the discovery endpoints.
 */
export async function collectAccount(
  userId: string,
  accessToken: string,
  username: string,
  options: CollectionOptions = {}
): Promise<AccountResult> {
  const clean = normalizeUsername(username);
  const discovery = new ThreadsDiscoveryAPI(accessToken);
  const conversations = new ThreadsConversationAPI(accessToken);

  try {
    const profile = await discovery.profileLookup(clean);
    await saveProfileSnapshot(userId, {
      username: clean,
      name: profile.name,
      biography: profile.biography,
      profilePictureUrl: profile.profile_picture_url,
      isVerified: profile.is_verified,
      followerCount: profile.follower_count,
      likesCount: profile.likes_count,
      repliesCount: profile.replies_count,
      repostsCount: profile.reposts_count,
      quotesCount: profile.quotes_count,
      viewsCount: profile.views_count,
    });

    const rawPosts = options.since
      ? await discovery.getProfilePostsByDateRange(clean, {
          since: options.since,
          until: options.until,
          maxPosts: options.maxPosts,
        })
      : await discovery.getProfilePosts(clean, options.maxPosts ?? 30);
    const posts: PostRow[] = [];
    const nodes: NodeRow[] = [];

    // Conversation reads dominate a historical backfill. Sixteen concurrent reads
    // keep a local six-month collection practical while remaining a bounded burst.
    const CONVERSATION_CONCURRENCY = 16;
    for (let start = 0; start < rawPosts.length; start += CONVERSATION_CONCURRENCY) {
      const batch = await Promise.all(
        rawPosts.slice(start, start + CONVERSATION_CONCURRENCY).map(async (post) => {
          let selfReplies = 0;
          let otherReplies = 0;
          let maxDepth = 0;
          let conversationScanned =
            options.includeConversations !== false && post.has_replies === false;
          const postNodes: NodeRow[] = [];

          // Skip the conversation call when the API already says there are no replies.
          if (options.includeConversations !== false && post.id && post.has_replies !== false) {
            try {
              const conversation = await conversations.getConversation(post.id);
              conversationScanned = true;
              const rootTime = new Date(post.timestamp).getTime();
              const treeNodeIds = selectSelfReplyTreeNodeIds(
                post.id,
                clean,
                conversation.map((node) => ({
                  id: node.id,
                  username: node.username,
                  parentId: node.replied_to?.id ?? null,
                }))
              );

              for (const node of conversation) {
                const isSelf = treeNodeIds.has(node.id);
                if (isSelf) {
                  selfReplies += 1;
                  maxDepth = Math.max(maxDepth, node.depth);
                } else {
                  otherReplies += 1;
                }

                const nodeTime = new Date(node.timestamp).getTime();
                postNodes.push({
                  rootPostId: post.id,
                  nodeId: node.id,
                  nodeUsername: node.username ?? '',
                  text: node.text ?? '',
                  postedAt: node.timestamp,
                  permalink: node.permalink ?? '',
                  parentId: node.replied_to?.id ?? null,
                  depth: node.depth,
                  isSelfReply: Boolean(isSelf),
                  secondsAfterRoot:
                    Number.isFinite(rootTime) && Number.isFinite(nodeTime)
                      ? Math.round((nodeTime - rootTime) / 1000)
                      : null,
                });
              }
            } catch (error) {
              // A single unreadable conversation must not lose the whole account.
              console.warn(`[research] conversation failed for ${post.id}:`, error);
            }
          }

          return {
            post: {
              postId: post.id,
              text: post.text ?? '',
              postedAt: post.timestamp,
              permalink: post.permalink ?? '',
              mediaType: post.media_type ?? '',
              isQuotePost: Boolean(post.is_quote_post),
              // Preserve the API's reply flag during the fast top-level-only pass.
              // A later conversation backfill replaces it with the counted result.
              hasReplies:
                options.includeConversations === false
                  ? Boolean(post.has_replies)
                  : selfReplies + otherReplies > 0,
              selfReplyCount: selfReplies,
              maxDepth,
              otherReplyCount: otherReplies,
              conversationScanned,
            } satisfies PostRow,
            nodes: postNodes,
          };
        })
      );

      for (const result of batch) {
        posts.push(result.post);
        nodes.push(...result.nodes);
      }
    }

    await upsertAccountData(userId, clean, posts, nodes);
    await markCollected(userId, clean, null);

    const orderedTimestamps = posts
      .map((post) => post.postedAt)
      .filter(Boolean)
      .sort((left, right) => new Date(left).getTime() - new Date(right).getTime());

    return {
      username: clean,
      ok: true,
      postCount: posts.length,
      selfReplyCount: nodes.filter((n) => n.isSelfReply).length,
      oldestPostAt: orderedTimestamps[0] ?? null,
      latestPostAt: orderedTimestamps.at(-1) ?? null,
      error: null,
      needsApproval: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const needsApproval = isPermissionError(message);
    const readable = needsApproval
      ? 'App Review未承認のため、このアカウントはまだ取得できません'
      : message;

    await markCollected(userId, clean, readable).catch(() => {});

    return {
      username: clean,
      ok: false,
      postCount: 0,
      selfReplyCount: 0,
      oldestPostAt: null,
      latestPostAt: null,
      error: readable,
      needsApproval,
    };
  }
}

/** Collect every active account on the watchlist, sequentially to respect rate limits. */
export async function collectAll(
  userId: string,
  accessToken: string,
  options: CollectionOptions & { username?: string } = {}
): Promise<CollectResult> {
  const watchlist = await listWatchlist(userId);
  const targets = options.username
    ? watchlist.filter((w) => w.username === normalizeUsername(options.username!))
    : watchlist.filter((w) => w.isActive);

  const results: AccountResult[] = [];
  for (const entry of targets) {
    results.push(await collectAccount(userId, accessToken, entry.username, options));
  }

  return { results, collectedAt: new Date().toISOString() };
}

/**
 * Daily bounded refresh for the approved research targets.
 * A three-day overlap catches newly published posts and late self-replies while
 * keeping the cron well below the serverless timeout. Older archive rows remain.
 */
export async function collectDailyResearchTargets(
  userId: string,
  accessToken: string
): Promise<CollectResult> {
  const until = new Date();
  const since = new Date(until.getTime() - 3 * 24 * 60 * 60 * 1000);
  const results: AccountResult[] = [];
  const ACCOUNT_CONCURRENCY = 2;
  for (
    let start = 0;
    start < THREADS_RESEARCH_TARGET_USERNAMES.length;
    start += ACCOUNT_CONCURRENCY
  ) {
    const batch = await Promise.all(
      THREADS_RESEARCH_TARGET_USERNAMES.slice(start, start + ACCOUNT_CONCURRENCY).map(
        (username) =>
          collectAccount(userId, accessToken, username, {
            since: since.toISOString(),
            until: until.toISOString(),
            maxPosts: 500,
            includeConversations: true,
          })
      )
    );
    results.push(...batch);
  }

  return { results, collectedAt: new Date().toISOString() };
}

/**
 * Populate an empty watchlist with the accounts that are readable today, so the
 * dashboard has real data before App Review completes.
 */
export async function seedStandardAccessAccounts(userId: string): Promise<void> {
  const existing = await listWatchlist(userId);
  if (existing.length > 0) return;

  for (const username of STANDARD_ACCESS_USERNAMES) {
    await addToWatchlist(userId, username, 'Standard Accessで取得できる検証用アカウント');
  }
}

export { getAccountSummaries };
