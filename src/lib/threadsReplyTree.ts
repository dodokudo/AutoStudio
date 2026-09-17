export interface ReplyTreeNodeLike {
  id: string;
  username?: string | null;
  parentId?: string | null;
}

/**
 * Select only the author's uninterrupted reply tree below their root post.
 *
 * An author's reply to another user's comment is intentionally excluded, as are
 * any descendants of that customer-conversation branch. A valid tree node must
 * therefore reply either to the root post or to another already-selected node
 * by the same author.
 */
export function selectSelfReplyTreeNodeIds(
  rootPostId: string,
  authorUsername: string,
  nodes: ReplyTreeNodeLike[]
): Set<string> {
  const author = authorUsername.replace(/^@/, '').toLowerCase();
  const children = new Map<string, ReplyTreeNodeLike[]>();

  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = children.get(node.parentId) ?? [];
    siblings.push(node);
    children.set(node.parentId, siblings);
  }

  const selected = new Set<string>();
  const pending = [...(children.get(rootPostId) ?? [])];

  while (pending.length > 0) {
    const node = pending.shift();
    if (!node || node.username?.replace(/^@/, '').toLowerCase() !== author) continue;
    if (selected.has(node.id)) continue;

    selected.add(node.id);
    pending.push(...(children.get(node.id) ?? []));
  }

  return selected;
}
