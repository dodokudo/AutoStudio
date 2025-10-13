import { PageSkeleton } from '@/components/ui/page-skeleton';

export default function ThreadsPromptLoading() {
  return <PageSkeleton sections={3} showFilters={false} />;
}
