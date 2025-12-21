/**
 * Autosave Hook - Automatically save project changes
 *
 * Features:
 * - Debounced saves (wait for user to stop editing)
 * - Periodic backup saves
 * - Save on visibility change (tab switch)
 * - Dirty state tracking
 */

import { useEffect, useRef, useCallback } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { useProjectStore } from '../store/projectStore';

export interface AutosaveOptions {
  /** Debounce delay in ms (default: 2000) */
  debounceMs?: number;
  /** Periodic save interval in ms (default: 30000) */
  intervalMs?: number;
  /** Enable/disable autosave (default: true) */
  enabled?: boolean;
}

export interface AutosaveState {
  isDirty: boolean;
  isSaving: boolean;
  lastSaved: Date | null;
  error: string | null;
}

export interface AutosaveResult extends AutosaveState {
  save: () => Promise<void>;
  markDirty: () => void;
}

/**
 * Hook for auto-saving project changes
 */
export function useAutosave(
  getGraphData: () => { nodes: unknown[]; edges: unknown[]; viewport?: { x: number; y: number; zoom: number } },
  options: AutosaveOptions = {}
): AutosaveResult {
  const { debounceMs = 2000, intervalMs = 30000, enabled = true } = options;

  const { saveProject, handleKey, hasUnsavedChanges, markDirty: storeMarkDirty } = useProjectStore();

  const isSavingRef = useRef(false);
  const lastHashRef = useRef('');
  const lastSavedRef = useRef<Date | null>(null);
  const errorRef = useRef<string | null>(null);

  // Save function
  const save = useCallback(async () => {
    if (!handleKey || isSavingRef.current) return;

    isSavingRef.current = true;
    errorRef.current = null;

    try {
      const graphData = getGraphData();
      await saveProject(graphData);
      lastSavedRef.current = new Date();
      lastHashRef.current = JSON.stringify(graphData);
    } catch (err) {
      errorRef.current = err instanceof Error ? err.message : 'Save failed';
      console.error('[Autosave] Error:', err);
    } finally {
      isSavingRef.current = false;
    }
  }, [handleKey, saveProject, getGraphData]);

  // Debounced save
  const debouncedSave = useDebouncedCallback(save, debounceMs);

  // Check for changes and trigger save
  const checkAndSave = useCallback(() => {
    if (!enabled || !handleKey) return;

    const graphData = getGraphData();
    const currentHash = JSON.stringify(graphData);

    if (currentHash !== lastHashRef.current) {
      storeMarkDirty();
      debouncedSave();
    }
  }, [enabled, handleKey, getGraphData, storeMarkDirty, debouncedSave]);

  // Periodic backup save
  useEffect(() => {
    if (!enabled || !handleKey) return;

    const interval = setInterval(() => {
      if (hasUnsavedChanges && !isSavingRef.current) {
        save();
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [enabled, handleKey, hasUnsavedChanges, intervalMs, save]);

  // Save on visibility change (tab switch, minimize)
  useEffect(() => {
    if (!enabled || !handleKey) return;

    const handleVisibilityChange = () => {
      if (document.hidden && hasUnsavedChanges && !isSavingRef.current) {
        save();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, handleKey, hasUnsavedChanges, save]);

  // Save on page unload
  useEffect(() => {
    if (!enabled || !handleKey) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        // Show browser's "unsaved changes" dialog
        e.preventDefault();
        e.returnValue = '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, handleKey, hasUnsavedChanges]);

  return {
    isDirty: hasUnsavedChanges,
    isSaving: isSavingRef.current,
    lastSaved: lastSavedRef.current,
    error: errorRef.current,
    save,
    markDirty: checkAndSave,
  };
}

/**
 * Hook for online/offline status
 */
export function useOnlineStatus(): boolean {
  const onlineRef = useRef(typeof navigator !== 'undefined' ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => {
      onlineRef.current = true;
    };
    const handleOffline = () => {
      onlineRef.current = false;
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return onlineRef.current;
}
