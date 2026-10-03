import { useSyncExternalStore } from 'react';
import { onlineManager } from '@tanstack/react-query';

export const useOnline = () =>
  useSyncExternalStore(
    onlineManager.subscribe,
    () => onlineManager.isOnline(),
    () => true
  );
