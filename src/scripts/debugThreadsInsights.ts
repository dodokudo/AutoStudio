import { getThreadsInsightsData } from '@/lib/threadsInsightsData';

(async () => {
  const data = await getThreadsInsightsData();
  console.log(JSON.stringify(data.slice(0, 10), null, 2));
})();
