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

export const useUIFeedbackStore = create<UIFeedbackState>((set) => ({
    flashingNodes: new Set(),

    flashNode: (nodeId: string) => {
        set((state) => {
            const newFlashing = new Set(state.flashingNodes);
            newFlashing.add(nodeId);
            return { flashingNodes: newFlashing };
        });

        // Auto-clear after animation completes (400ms)
        setTimeout(() => {
            set((state) => {
                const newFlashing = new Set(state.flashingNodes);
                newFlashing.delete(nodeId);
                return { flashingNodes: newFlashing };
            });
        }, 400);
    },

    clearFlash: (nodeId: string) => {
        set((state) => {
            const newFlashing = new Set(state.flashingNodes);
            newFlashing.delete(nodeId);
            return { flashingNodes: newFlashing };
        });
    }
}));
