import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getOrgs } from '@/lib/config';
import { DashboardShell } from '@/components/layout/dashboard-shell';
import { syncAll } from '@/lib/sync';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  // Sync filesystem state to SQLite on every page load
  // This ensures the dashboard always reflects the latest agent activity
  try {
    syncAll();
  } catch (e) {
    console.error('Sync failed:', e);
  }

  const orgs = getOrgs();

  // Fresh install funnel: an authenticated user with no orgs is bounced to
  // the visual setup wizard. The pathname is set by middleware via the
  // x-pathname header so we don't loop when the user is already there.
  if (orgs.length === 0) {
    const hdrs = await headers();
    const pathname = hdrs.get('x-pathname') ?? '';
    if (!pathname.startsWith('/onboarding')) {
      redirect('/onboarding');
    }
  }

  return <DashboardShell orgs={orgs}>{children}</DashboardShell>;
}
