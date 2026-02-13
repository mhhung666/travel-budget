'use client';

import { useEffect, useState, useCallback } from 'react';
import { getCurrentUser } from '@/actions';
import type { AuthUserWithCreatedAt } from '@/actions';
import type { ActionResult } from '@/actions';
import type { Member } from '@/types';
import { getMembers } from '@/actions';

interface PublicEndpointConfig {
  /** API path relative to /api/public/trips/{tripId}/, e.g. '' for trip, 'members', 'expenses' */
  path: string;
  /** Key in the JSON response that holds the data, e.g. 'trip', 'members', 'expenses' */
  responseKey: string;
}

interface UseTripDataOptions<T> {
  /** Server Action to fetch data (used when authenticated & is a member) */
  serverAction: (tripId: string) => Promise<ActionResult<T>>;
  /** Public API endpoint config (used when not authenticated or not a member) */
  publicEndpoint: PublicEndpointConfig;
  /** Default value for data when nothing is loaded yet */
  defaultValue: T;
}

interface UseTripDataResult<T> {
  data: T;
  setData: React.Dispatch<React.SetStateAction<T>>;
  members: Member[];
  currentUser: AuthUserWithCreatedAt | null;
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  isMember: boolean;
  isAdmin: boolean;
}

/**
 * Unified hook for loading trip-related data with auth check and public API fallback.
 *
 * Handles the common pattern across trip detail, itinerary, and settlement pages:
 * 1. Check authentication (not required)
 * 2. If authenticated, try Server Action
 * 3. If FORBIDDEN or not authenticated, fall back to public API
 * 4. Always loads members alongside the primary data
 */
export function useTripData<T>(
  tripId: string,
  options: UseTripDataOptions<T>,
  errorMessage: string = 'Failed to load data',
): UseTripDataResult<T> {
  const [data, setData] = useState<T>(options.defaultValue);
  const [members, setMembers] = useState<Member[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUserWithCreatedAt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadPublicData = useCallback(async () => {
    const [dataResponse, membersResponse] = await Promise.all([
      fetch(`/api/public/trips/${tripId}/${options.publicEndpoint.path}`),
      fetch(`/api/public/trips/${tripId}/members`),
    ]);

    if (!dataResponse.ok) {
      setError(errorMessage);
      return;
    }

    const dataJson = await dataResponse.json();
    const membersJson = await membersResponse.json();

    setData(dataJson[options.publicEndpoint.responseKey] ?? options.defaultValue);
    setMembers(membersJson.members || []);
  }, [tripId, options.publicEndpoint.path, options.publicEndpoint.responseKey, options.defaultValue, errorMessage]);

  // Light reload: only refetch primary data (skip user & members)
  const reloadData = useCallback(async () => {
    try {
      if (currentUser) {
        const dataResult = await options.serverAction(tripId);
        if (dataResult.success) {
          setData(dataResult.data);
        }
      } else {
        const dataResponse = await fetch(`/api/public/trips/${tripId}/${options.publicEndpoint.path}`);
        if (dataResponse.ok) {
          const dataJson = await dataResponse.json();
          setData(dataJson[options.publicEndpoint.responseKey] ?? options.defaultValue);
        }
      }
    } catch {
      // silent fail on reload — initial data remains
    }
  }, [tripId, currentUser, options.serverAction, options.publicEndpoint.path, options.publicEndpoint.responseKey, options.defaultValue]);

  // Full initial load: fetch user, members, and data in parallel
  const loadData = useCallback(async () => {
    try {
      // Fire all requests in parallel — don't wait for getCurrentUser before fetching data
      const [userResult, dataResult, membersResult] = await Promise.all([
        getCurrentUser(),
        options.serverAction(tripId),
        getMembers(tripId),
      ]);

      const user = (userResult.success && userResult.data) ? userResult.data : null;
      if (user) {
        setCurrentUser(user);
      }

      if (!dataResult.success) {
        if (dataResult.code === 'FORBIDDEN' || dataResult.code === 'UNAUTHORIZED') {
          // Not authenticated or not a member — fall back to public API
          await loadPublicData();
          return;
        }
        setError(errorMessage);
        return;
      }

      setData(dataResult.data);
      setMembers(membersResult.success ? membersResult.data : []);
    } catch {
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [tripId, options.serverAction, loadPublicData, errorMessage]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isMember = currentUser != null && members.some((m) => m.id === currentUser.id);
  const isAdmin = members.find((m) => m.id === currentUser?.id)?.role === 'admin';

  return {
    data,
    setData,
    members,
    currentUser,
    loading,
    error,
    reload: reloadData,
    isMember,
    isAdmin,
  };
}
