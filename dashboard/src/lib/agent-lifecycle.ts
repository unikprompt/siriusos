export type DashboardLifecycleAction =
  | 'enable'
  | 'disable'
  | 'restart'
  | 'start'
  | 'stop'
  | 'restart_continue'
  | 'restart_fresh';

export const DASHBOARD_LIFECYCLE_ACTIONS: readonly DashboardLifecycleAction[] = [
  'enable',
  'disable',
  'restart',
  'start',
  'stop',
  'restart_continue',
  'restart_fresh',
];

export function buildLifecycleCliArgs(
  action: DashboardLifecycleAction,
  agent: string,
  instance: string,
  org?: string,
): string[] {
  switch (action) {
    case 'enable':
    case 'start':
      if (!org) throw new Error('Organization is required to start an agent');
      return ['enable', agent, '--instance', instance, '--org', org];
    case 'disable':
    case 'stop':
      return ['disable', agent, '--instance', instance];
    case 'restart':
    case 'restart_continue':
      return ['restart', agent, '--instance', instance];
    case 'restart_fresh':
      return ['restart', agent, '--instance', instance, '--fresh'];
  }
}

export function buildPurgeCliArgs(
  agent: string,
  instance: string,
  org: string,
): string[] {
  return ['purge', 'agent', agent, '--instance', instance, '--org', org, '--yes'];
}
