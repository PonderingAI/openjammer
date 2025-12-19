/**
 * Canvas Navigation Store - Manages hierarchical canvas navigation
 *
 * Tracks the navigation stack when diving into nodes (E key) and going back up (Q key).
 * Level 0 = root canvas, level 1 = inside a node, level 2 = inside a node inside a node, etc.
 */

import { create } from 'zustand';
import type { GraphNode } from '../engine/types';
import { useGraphStore } from './graphStore';

interface CanvasNavigationState {
    // Navigation stack: ['root', 'node-123', 'node-456']
    // index 0 is always 'root', subsequent entries are node IDs
    navigationStack: string[];

    // Current level: 0 = root, 1 = inside node-123, 2 = inside node-456
    currentLevel: number;

    // Current parent node (null if at root)
    currentParentNode: GraphNode | null;

    // Actions
    diveInto: (nodeId: string) => void;
    goBackUp: () => void;
    resetToRoot: () => void;
    updateCurrentParentNode: () => void;
}

export const useCanvasNavigationStore = create<CanvasNavigationState>((set, get) => ({
    navigationStack: ['root'],
    currentLevel: 0,
    currentParentNode: null,

    // Dive into a node's internal canvas
    diveInto: (nodeId: string) => {
        const state = get();
        const newStack = [...state.navigationStack, nodeId];
        const newLevel = newStack.length - 1;

        set({
            navigationStack: newStack,
            currentLevel: newLevel
        });

        // Update current parent node
        get().updateCurrentParentNode();
    },

    // Go back up one level
    goBackUp: () => {
        const state = get();
        if (state.currentLevel === 0) return; // Already at root

        const newStack = state.navigationStack.slice(0, -1);
        const newLevel = newStack.length - 1;

        set({
            navigationStack: newStack,
            currentLevel: newLevel
        });

        // Update current parent node
        get().updateCurrentParentNode();
    },

    // Reset to root canvas
    resetToRoot: () => {
        set({
            navigationStack: ['root'],
            currentLevel: 0,
            currentParentNode: null
        });
    },

    // Update currentParentNode based on navigation stack
    // This traverses the hierarchy to find the correct node
    updateCurrentParentNode: () => {
        const state = get();
        if (state.currentLevel === 0) {
            set({ currentParentNode: null });
            return;
        }

        // Traverse the stack to find the current parent
        const graphNodes = useGraphStore.getState().nodes;
        let currentNode: GraphNode | undefined;

        // Start from level 0 (root) and traverse down
        for (let i = 1; i <= state.currentLevel; i++) {
            const nodeId = state.navigationStack[i];

            if (i === 1) {
                // First level: get from root nodes
                currentNode = graphNodes.get(nodeId);
            } else if (currentNode?.internalNodes) {
                // Deeper levels: get from parent's internal nodes
                currentNode = currentNode.internalNodes.get(nodeId);
            } else {
                // Invalid path
                console.error('Invalid navigation path:', state.navigationStack);
                get().resetToRoot();
                return;
            }

            if (!currentNode) {
                // Node not found
                console.error('Node not found in navigation:', nodeId);
                get().resetToRoot();
                return;
            }
        }

        set({ currentParentNode: currentNode || null });
    }
}));
