import { config } from 'dotenv';
import { resolve } from 'path';
import { searchWeb, searchForThreadsContent } from '@/lib/tavily/client';

// Load .env.local
config({ path: resolve(process.cwd(), '.env.local') });

async function testTavilyAPI() {
  console.log('🔍 Testing Tavily API...\n');

  try {
    // Test 1: Basic search
    console.log('📌 Test 1: Basic web search');
    const results = await searchWeb({
      query: 'AI trends 2025',
      maxResults: 3,
    });

    console.log(`✅ Found ${results.length} results\n`);
    results.forEach((result, index) => {
      console.log(`[${index + 1}] ${result.title}`);
      console.log(`    URL: ${result.url}`);
      console.log(`    Score: ${result.score}`);
      console.log(`    Content: ${result.content.slice(0, 100)}...\n`);
    });

    // Test 2: Search for Threads content
    console.log('📌 Test 2: Search for Threads content');
    const threadsSummary = await searchForThreadsContent('生成AIの最新トレンド');
    console.log('✅ Threads content summary:');
    console.log(threadsSummary);

    console.log('\n🎉 All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testTavilyAPI();
