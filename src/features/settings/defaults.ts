import type { Settings } from '@/db/schema';

export const DEFAULT_SETTINGS: Settings = {
  syncFrequency: '30m',
  notificationsEnabled: false,
  density: 'comfortable',
  retentionPerFeed: 200,
  lastSyncAt: null,
  onboardingDone: false,
  installDismissedAt: null,
  appBadge: true,
  storagePersistAskedAt: null,
};
