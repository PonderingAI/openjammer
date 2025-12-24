/**
 * Transport Store - Global transport state for continuous audio sources
 *
 * Controls play/pause for continuous audio sources (Loopers) while allowing
 * live instruments to still be played.
 */

import { create } from 'zustand';
import { audioGraphManager } from '../audio/AudioGraphManager';

// ============================================================================
// Store Interface
// ============================================================================

interface TransportStore {
    // State
    isGloballyPaused: boolean;

    // Actions
    toggleGlobalPause: () => void;
    pause: () => void;
    resume: () => void;
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useTransportStore = create<TransportStore>((set, get) => ({
    isGloballyPaused: false,

    toggleGlobalPause: () => {
        const { isGloballyPaused } = get();
        if (isGloballyPaused) {
            get().resume();
        } else {
            get().pause();
        }
    },

    pause: () => {
        audioGraphManager.pauseAllContinuousSources();
        set({ isGloballyPaused: true });
    },

    resume: () => {
        audioGraphManager.resumeAllContinuousSources();
        set({ isGloballyPaused: false });
    },
}));
