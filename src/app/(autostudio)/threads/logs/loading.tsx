import { PageSkeleton } from '@/components/ui/page-skeleton';

export default function ThreadsLogsLoading() {
  return <PageSkeleton sections={2} showFilters={false} />;
}
