/**
 * UI Feedback Store - Visual feedback for user actions
 */

import { create } from 'zustand';

interface UIFeedbackState {
    // Node IDs that should flash red (attempted deletion of special nodes)
    flashingNodes: Set<string>;

    // Flash a node red
    flashNode: (nodeId: string) => void;

    // Clear flash for a node
    clearFlash: (nodeId: string) => void;
}

// Track active timeouts to prevent leaks on rapid re-flashing
const flashTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export const useUIFeedbackStore = create<UIFeedbackState>((set) => ({
    flashingNodes: new Set(),

    flashNode: (nodeId: string) => {
        // Cancel any existing timeout for this node
        const existingTimeout = flashTimeouts.get(nodeId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
        }

        set((state) => {
            const newFlashing = new Set(state.flashingNodes);
            newFlashing.add(nodeId);
            return { flashingNodes: newFlashing };
        });

        // Auto-clear after animation completes (400ms)
        const timeoutId = setTimeout(() => {
            flashTimeouts.delete(nodeId);
            set((state) => {
                const newFlashing = new Set(state.flashingNodes);
                newFlashing.delete(nodeId);
                return { flashingNodes: newFlashing };
            });
        }, 400);
        flashTimeouts.set(nodeId, timeoutId);
    },

    clearFlash: (nodeId: string) => {
        // Cancel any pending timeout
        const existingTimeout = flashTimeouts.get(nodeId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
            flashTimeouts.delete(nodeId);
        }

        set((state) => {
            const newFlashing = new Set(state.flashingNodes);
            newFlashing.delete(nodeId);
            return { flashingNodes: newFlashing };
        });
    }
}));
