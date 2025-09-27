const GENERIC_PREFIX_PATTERNS = [
  /^[-=–—―ー＊*·●○◆◇■□▶︎▷◀︎◁・\s]+/u,
];

const MAIN_LABEL_PATTERNS = [
  /^\s*(?:【|\(|\[)?\s*(?:メイン\s*投稿|メイン|main\s*(?:post|text)|primary\s*post)(?:】|\)|\])?\s*[:：\-‐‒—–ー]?\s*/iu,
  /^\s*(?:本文|主文)\s*[:：\-‐‒—–ー]?\s*/u,
];

const COMMENT_LABEL_PATTERNS = [
  /^\s*(?:【|\(|\[)?\s*(?:コメント(?:欄)?\s*(?:\d+|[一二三四五六七八九十]+)|コメ\s*\d+|comment\s*(?:\d+|one|two|three)|reply\s*\d+)(?:】|\)|\])?\s*[:：\-‐‒—–ー]?\s*/iu,
  /^\s*(?:コメント(?:欄)?)(?=[\s:：\-‐‒—–ー]|$)\s*[:：\-‐‒—–ー]?\s*/iu,
  /^\s*(?:補足|追記)\s*[:：\-‐‒—–ー]?\s*/u,
];

function applyPatterns(value: string, patterns: RegExp[]): { result: string; replaced: boolean } {
  let result = value;
  let replaced = false;

  for (const pattern of patterns) {
    const next = result.replace(pattern, '');
    if (next !== result) {
      result = next;
      replaced = true;
      break;
    }
  }

  return { result, replaced };
}

function stripWithPatterns(value: string, patterns: RegExp[]): string {
  const original = value ?? '';
  const trimmedOriginal = original.trim();
  if (!trimmedOriginal) return '';

  let current = trimmedOriginal;
  let iterations = 0;
  const maxIterations = patterns.length + GENERIC_PREFIX_PATTERNS.length + 2;

  while (iterations < maxIterations) {
    iterations += 1;
    const { result, replaced } = applyPatterns(current, patterns);
    current = result.trimStart();

    if (!replaced) {
      const generic = applyPatterns(current, GENERIC_PREFIX_PATTERNS);
      current = generic.result.trimStart();
      if (!generic.replaced) {
        break;
      }
    }
  }

  const finalText = current.trim();
  return finalText.length ? finalText : trimmedOriginal;
}

export function sanitizeThreadsMainPost(value: string): string {
  return stripWithPatterns(value, MAIN_LABEL_PATTERNS);
}

export function sanitizeThreadsComment(value: string): string {
  return stripWithPatterns(value, COMMENT_LABEL_PATTERNS);
}
