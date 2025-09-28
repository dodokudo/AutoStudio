const CLAUDE_API_URL = process.env.CLAUDE_API_URL?.trim() ?? 'https://api.anthropic.com/v1/messages';
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY?.trim();
const CLAUDE_SCRIPT_MODEL =
  process.env.CLAUDE_SCRIPT_MODEL?.trim()
  ?? process.env.CLAUDE_MODEL?.trim()
  ?? 'claude-3-5-sonnet-latest';

export async function requestClaudeYoutubeScript(prompt: string) {
  if (!CLAUDE_API_KEY) {
    throw new Error('CLAUDE_API_KEY is not configured');
  }

  console.log('[claude] Making request to:', CLAUDE_API_URL);
  console.log('[claude] Using model:', CLAUDE_SCRIPT_MODEL);

  const requestBody = {
    model: CLAUDE_SCRIPT_MODEL,
    max_tokens: 6000,
    temperature: 0.6,
    system:
      'You are a professional Japanese YouTube script writer. Always respond with pure JSON (no Markdown code fences, no explanations).',
    messages: [
      {
        role: 'user',
        content: prompt,
      },
    ],
  };

  let retries = 3;
  while (retries > 0) {
    try {
      const response = await fetch(CLAUDE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': CLAUDE_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('[claude] API error response:', response.status, text);

        if (response.status === 503 && retries > 1) {
          console.log(`[claude] Retrying due to 503 error, ${retries - 1} retries left`);
          retries--;
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }

        throw new Error(`Claude API error: ${response.status} ${response.statusText} ${text}`);
      }

      const data = await response.json();
      const textContent = data?.content?.[0]?.text;
      if (!textContent || typeof textContent !== 'string') {
        throw new Error('Unexpected Claude response format');
      }

      const clean = textContent
        .replace(/```json\s*/g, '')
        .replace(/```\s*/g, '')
        .trim();

      try {
        return JSON.parse(clean) as unknown;
      } catch (error) {
        console.error('[claude] raw response:', textContent);
        throw new Error(`Failed to parse Claude JSON response: ${(error as Error).message}`);
      }
    } catch (error) {
      if (retries === 1) throw error;
      console.log(`[claude] Request failed, retrying... ${retries - 1} retries left`);
      retries--;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  throw new Error('All retry attempts failed');
}
