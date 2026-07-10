import type { Viewport } from 'next';
import type { ReactNode } from 'react';
import { AutoStudioShell } from './_components/autostudio-shell';

export const viewport: Viewport = {
  width: 1120,
  initialScale: 1,
};

export default function AutoStudioLayout({ children }: { children: ReactNode }) {
  return <AutoStudioShell>{children}</AutoStudioShell>;
}
