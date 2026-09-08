'use client';

import { lazyDialog } from '@/components/common/lazyDialog';

export const FlightRecordDialog = lazyDialog(async () => ({
  default: (await import('./FlightRecordDialog')).FlightRecordDialog,
}));
export const StayRecordDialog = lazyDialog(async () => ({
  default: (await import('./StayRecordDialog')).StayRecordDialog,
}));
