import { PageSkeleton } from '@/components/ui/page-skeleton';

export default function LinkDetailsLoading() {
  return <PageSkeleton sections={2} showFilters={false} />;
}
