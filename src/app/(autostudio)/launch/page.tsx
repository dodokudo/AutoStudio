import { Suspense } from 'react';
import { PageSkeleton } from '@/components/ui/page-skeleton';
import { LaunchDashboardClient } from './_components/LaunchDashboardClient';

export const revalidate = 3600;

export default function LaunchPage() {
  return (
    <Suspense fallback={<PageSkeleton sections={3} />}>
      <LaunchDashboardClient />
    </Suspense>
  );
}
