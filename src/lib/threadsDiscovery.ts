/**
 * Threads Discovery API Client
 *
 * Competitor research: keyword search (discovery) + profile lookup / profile posts (deep dive).
 * Kept separate from lib/threads.ts, which owns the connected account's own posts,
 * insights and publishing.
 *
 * Permissions required on the access token:
 *   - threads_basic             (mandatory for every call)
 *   - threads_keyword_search    (/keyword_search)
 *   - threads_profile_discovery (/profile_lookup, /profile_posts)
 *
 * Access level notes (Meta docs):
 *   - Standard Access: keyword_search only returns the authenticated user's own posts,
 *     and profile_lookup / profile_posts only resolve @meta, @threads, @instagram, @facebook.
 *   - Advanced Access (App Review): public posts and arbitrary public profiles.
 *
 * Rate limits: keyword_search 2,200 queries / rolling 24h (queries returning no results
 * are not counted). profile_lookup + profile_posts share 1,000 requests / rolling 24h.
 */

const GRAPH_BASE = 'https://graph.threads.net/v1.0';

/** Fields returned for a discovered post. `owner` is never returned by these endpoints. */
const POST_FIELDS = [
  'id',
  'username',
  'text',
  'timestamp',
  'permalink',
  'media_type',
  'media_url',
  'thumbnail_url',
  'shortcode',
  'is_quote_post',
  'has_replies',
].join(',');

/**
 * profile_lookup does NOT expose `id` - requesting it fails the whole call with
 * "Tried accessing nonexisting field (id)". Verified live against @meta.
 */
const PROFILE_FIELDS = [
  'username',
  'name',
  'biography',
  'profile_picture_url',
  'is_verified',
  'follower_count',
  'likes_count',
  'replies_count',
  'reposts_count',
  'quotes_count',
  'views_count',
].join(',');

export interface DiscoveredPost {
  id: string;
  username?: string;
  text?: string;
  timestamp: string;
  permalink?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  shortcode?: string;
  is_quote_post?: boolean;
  has_replies?: boolean;
}

/**
 * Public profile of a competitor.
 * follower_count is a lifetime total. The engagement counters and views_count are
 * aggregates over that profile's posts for the past 7 days only - they are NOT
 * per-post values and NOT lifetime values.
 */
export interface CompetitorProfile {
  username: string;
  name?: string;
  biography?: string;
  profile_picture_url?: string;
  is_verified?: boolean;
  follower_count?: number;
  likes_count?: number;
  replies_count?: number;
  reposts_count?: number;
  quotes_count?: number;
  views_count?: number;
}

export interface KeywordSearchOptions {
  /** TOP (default) ranks by relevance, RECENT by recency. */
  searchType?: 'TOP' | 'RECENT';
  /** KEYWORD (default) or TAG for topic tags. */
  searchMode?: 'KEYWORD' | 'TAG';
  mediaType?: 'TEXT' | 'IMAGE' | 'VIDEO';
  /** Unix seconds. Must be >= 1688540400 (Threads launch) and < until. */
  since?: number;
  /** Unix seconds. Must be <= now and > since. */
  until?: number;
  /** Exact username match, without the leading @. */
  authorUsername?: string;
  /** 1-100, default 25. */
  limit?: number;
}

export interface ProfilePostRangeOptions {
  /** Inclusive ISO timestamp. Pagination stops after crossing this timestamp. */
  since: string;
  /** Inclusive ISO timestamp. Defaults to now. */
  until?: string;
  /** Safety cap for unusually active accounts. */
  maxPosts?: number;
}

export class ThreadsDiscoveryAPI {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams({ ...params, access_token: this.accessToken });
    const response = await fetch(`${GRAPH_BASE}/${path}?${query.toString()}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Threads discovery request failed (${path}): ${error}`);
    }

    return await response.json();
  }

  /**
   * Search public Threads posts by keyword or tag.
   * Used to discover competitor accounts before adding them to the watchlist.
   */
  async keywordSearch(
    keyword: string,
    options: KeywordSearchOptions = {}
  ): Promise<DiscoveredPost[]> {
    const params: Record<string, string> = {
      q: keyword,
      fields: POST_FIELDS,
      search_type: options.searchType || 'TOP',
      search_mode: options.searchMode || 'KEYWORD',
      limit: String(options.limit ?? 25),
    };

    if (options.mediaType) params.media_type = options.mediaType;
    if (options.since) params.since = String(options.since);
    if (options.until) params.until = String(options.until);
    if (options.authorUsername) params.author_username = options.authorUsername.replace(/^@/, '');

    const data = await this.get<{ data?: DiscoveredPost[] }>('keyword_search', params);
    return data.data || [];
  }

  /**
   * Collect the distinct usernames behind a keyword search, most frequent first.
   * This is the bridge from discovery to the profile endpoints.
   */
  async findAuthorsByKeyword(
    keyword: string,
    options: KeywordSearchOptions = {}
  ): Promise<{ username: string; postCount: number }[]> {
    const posts = await this.keywordSearch(keyword, { limit: 100, ...options });
    const counts = new Map<string, number>();

    for (const post of posts) {
      if (!post.username) continue;
      counts.set(post.username, (counts.get(post.username) || 0) + 1);
    }

    return [...counts.entries()]
      .map(([username, postCount]) => ({ username, postCount }))
      .sort((a, b) => b.postCount - a.postCount);
  }

  /**
   * Look up a public profile by username.
   * Only resolves public profiles with at least 100 followers.
   */
  async profileLookup(username: string): Promise<CompetitorProfile> {
    return await this.get<CompetitorProfile>('profile_lookup', {
      username: username.replace(/^@/, ''),
      fields: PROFILE_FIELDS,
    });
  }

  /**
   * Fetch a public profile's top-level posts. Replies are not included.
   * Follows pagination up to `maxPosts`.
   */
  async getProfilePosts(username: string, maxPosts = 100): Promise<DiscoveredPost[]> {
    const clean = username.replace(/^@/, '');
    const posts: DiscoveredPost[] = [];
    let after: string | undefined;

    while (posts.length < maxPosts) {
      const params: Record<string, string> = {
        username: clean,
        fields: POST_FIELDS,
        limit: String(Math.min(100, maxPosts - posts.length)),
      };
      if (after) params.after = after;

      const page = await this.get<{
        data?: DiscoveredPost[];
        paging?: { cursors?: { after?: string }; next?: string };
      }>('profile_posts', params);

      const batch = page.data || [];
      posts.push(...batch);

      after = page.paging?.next ? page.paging?.cursors?.after : undefined;
      if (!after || batch.length === 0) break;
    }

    return posts.slice(0, maxPosts);
  }

  /**
   * Fetch every public top-level post inside an inclusive time range.
   *
   * `/profile_posts` has no `since` / `until` parameters, so the range must be
   * implemented by walking its newest-first cursor and filtering timestamps. The
   * walk stops once an entire page is older than `since`.
   */
  async getProfilePostsByDateRange(
    username: string,
    options: ProfilePostRangeOptions
  ): Promise<DiscoveredPost[]> {
    const clean = username.replace(/^@/, '');
    const sinceMs = new Date(options.since).getTime();
    const untilMs = new Date(options.until ?? new Date().toISOString()).getTime();
    const maxPosts = Math.max(1, options.maxPosts ?? 10_000);

    if (!Number.isFinite(sinceMs) || !Number.isFinite(untilMs)) {
      throw new Error('Invalid profile post date range');
    }
    if (sinceMs > untilMs) {
      throw new Error('Profile post range start must be before end');
    }

    const posts: DiscoveredPost[] = [];
    let after: string | undefined;

    while (posts.length < maxPosts) {
      const params: Record<string, string> = {
        username: clean,
        fields: POST_FIELDS,
        limit: '100',
      };
      if (after) params.after = after;

      const page = await this.get<{
        data?: DiscoveredPost[];
        paging?: { cursors?: { after?: string }; next?: string };
      }>('profile_posts', params);
      const batch = page.data || [];
      if (batch.length === 0) break;

      let allValidTimestampsAreOlder = true;
      for (const post of batch) {
        const postedAtMs = new Date(post.timestamp).getTime();
        if (!Number.isFinite(postedAtMs)) continue;
        if (postedAtMs >= sinceMs) allValidTimestampsAreOlder = false;
        if (postedAtMs >= sinceMs && postedAtMs <= untilMs) posts.push(post);
        if (posts.length >= maxPosts) break;
      }

      if (allValidTimestampsAreOlder) break;
      after = page.paging?.next ? page.paging?.cursors?.after : undefined;
      if (!after) break;
    }

    return posts
      .slice(0, maxPosts)
      .sort((left, right) => new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime());
  }
}

/**
 * One node of a post's conversation tree.
 * `repliedTo` is the direct parent (the root post itself for a first-level reply),
 * `depth` is 1 for a direct reply to the root, 2 for a reply to that, and so on.
 */
export interface ConversationNode extends DiscoveredPost {
  is_reply?: boolean;
  has_replies?: boolean;
  root_post?: { id: string };
  replied_to?: { id: string };
  depth: number;
}

/** Fields that carry the thread structure. Verified live against public posts. */
const CONVERSATION_FIELDS = [
  'id',
  'username',
  'text',
  'timestamp',
  'permalink',
  'media_type',
  'is_reply',
  'has_replies',
  'root_post',
  'replied_to',
].join(',');

export class ThreadsConversationAPI {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async get<T>(path: string, params: Record<string, string>): Promise<T> {
    const query = new URLSearchParams({ ...params, access_token: this.accessToken });
    const response = await fetch(`${GRAPH_BASE}/${path}?${query.toString()}`);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Threads conversation request failed (${path}): ${error}`);
    }

    return await response.json();
  }

  /**
   * Every reply under a post, nested replies included, across pages.
   *
   * `/replies` returns only direct children; `/conversation` returns the whole
   * subtree, which is what a self-reply chain needs.
   */
  async getConversation(postId: string, maxNodes = 500): Promise<ConversationNode[]> {
    const nodes: Omit<ConversationNode, 'depth'>[] = [];
    let after: string | undefined;

    while (nodes.length < maxNodes) {
      const params: Record<string, string> = {
        fields: CONVERSATION_FIELDS,
        limit: String(Math.min(100, maxNodes - nodes.length)),
      };
      if (after) params.after = after;

      const page = await this.get<{
        data?: Omit<ConversationNode, 'depth'>[];
        paging?: { cursors?: { after?: string }; next?: string };
      }>(`${postId}/conversation`, params);

      const batch = page.data || [];
      nodes.push(...batch);

      after = page.paging?.next ? page.paging?.cursors?.after : undefined;
      if (!after || batch.length === 0) break;
    }

    return withDepth(postId, nodes);
  }

  /**
   * The author's own chain under their post - the "tree" style used to stack a hook,
   * the body and a CTA across consecutive self-replies.
   *
   * Returned oldest first, which is the order a reader sees them.
   */
  async getSelfReplyChain(
    postId: string,
    authorUsername: string,
    maxNodes = 500
  ): Promise<ConversationNode[]> {
    const clean = authorUsername.replace(/^@/, '').toLowerCase();
    const conversation = await this.getConversation(postId, maxNodes);

    return conversation
      .filter((node) => node.username?.toLowerCase() === clean)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }
}

/**
 * Resolve each node's nesting level from its `replied_to` parent.
 * Nodes whose parent is missing from the page set fall back to depth 1 so that a
 * truncated fetch still produces usable rows.
 */
function withDepth(
  rootId: string,
  nodes: Omit<ConversationNode, 'depth'>[]
): ConversationNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  const depthOf = (node: Omit<ConversationNode, 'depth'>, seen = new Set<string>()): number => {
    const parentId = node.replied_to?.id;
    if (!parentId || parentId === rootId) return 1;
    if (seen.has(node.id)) return 1; // defensive: never loop on malformed data
    seen.add(node.id);

    const parent = byId.get(parentId);
    return parent ? depthOf(parent, seen) + 1 : 1;
  };

  return nodes.map((node) => ({ ...node, depth: depthOf(node) }));
}

/**
 * Inspect which permissions an access token actually carries.
 * Useful after re-authenticating: a permission enabled in the Meta dashboard is only
 * attached to a token if it was requested in the OAuth scope parameter.
 */
export async function debugTokenScopes(accessToken: string): Promise<{
  isValid: boolean;
  scopes: string[];
  expiresAt: string | null;
}> {
  const query = new URLSearchParams({
    input_token: accessToken,
    access_token: accessToken,
  });
  const response = await fetch(`${GRAPH_BASE}/debug_token?${query.toString()}`);

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to debug Threads token: ${error}`);
  }

  const { data } = await response.json();
  return {
    isValid: Boolean(data?.is_valid),
    scopes: Array.isArray(data?.scopes) ? data.scopes : [],
    expiresAt: data?.expires_at ? new Date(data.expires_at * 1000).toISOString() : null,
  };
}
