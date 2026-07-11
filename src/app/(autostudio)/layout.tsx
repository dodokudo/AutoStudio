import type { ReactNode } from 'react';
import { AutoStudioShell } from './_components/autostudio-shell';


export default function AutoStudioLayout({ children }: { children: ReactNode }) {
  return <AutoStudioShell>{children}</AutoStudioShell>;
}
