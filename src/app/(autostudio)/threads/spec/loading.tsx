import { PageSkeleton } from '@/components/ui/page-skeleton';

export default function ThreadsSpecLoading() {
  return <PageSkeleton sections={3} showFilters={false} />;
}
