import { Suspense } from 'react';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { LaunchDashboardClient } from './_components/LaunchDashboardClient';

export default function LaunchPage() {
  return (
    <Suspense fallback={<PageSkeleton sections={3} />}>
      <LaunchDashboardClient />
    </Suspense>
  );
}
