/**
 * Canvas Store - Manages canvas pan/zoom state
 */

import { create } from 'zustand';
import type { Position } from '../engine/types';

interface ConnectionSource {
    nodeId: string;
    portId: string;
}

interface CanvasStore {
    // Transform State
    pan: Position;
    zoom: number;

    // Interaction State
    isDragging: boolean;
    isPanning: boolean;
    isConnecting: boolean;
    // Normalized to array for multi-connect support
    connectingFrom: ConnectionSource[] | null;

    // Ghost Mode - reduces node opacity, disables buttons, only connections editable
    ghostMode: boolean;

    // Transform Actions
    setPan: (pan: Position) => void;
    setZoom: (zoom: number) => void;
    panBy: (delta: Position) => void;
    zoomTo: (zoom: number, center?: Position) => void;
    resetView: () => void;

    // Interaction Actions
    setDragging: (isDragging: boolean) => void;
    setPanning: (isPanning: boolean) => void;
    startConnecting: (nodeId: string, portId: string | string[]) => void;
    stopConnecting: () => void;
    toggleGhostMode: () => void;

    // Coordinate Transforms
    screenToCanvas: (screenPos: Position) => Position;
    canvasToScreen: (canvasPos: Position) => Position;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;
const DEFAULT_ZOOM = 1;

export const useCanvasStore = create<CanvasStore>((set, get) => ({
    // Initial State
    pan: { x: 0, y: 0 },
    zoom: DEFAULT_ZOOM,
    isDragging: false,
    isPanning: false,
    isConnecting: false,
    connectingFrom: null,
    ghostMode: false,

    // Transform Actions
    setPan: (pan) => set({ pan }),

    setZoom: (zoom) => set({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) }),

    panBy: (delta) => set((state) => ({
        pan: {
            x: state.pan.x + delta.x,
            y: state.pan.y + delta.y
        }
    })),

    zoomTo: (newZoom, center) => {
        const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

        if (center) {
            const state = get();
            const zoomRatio = clampedZoom / state.zoom;

            // Adjust pan to keep the center point stationary
            const newPan = {
                x: center.x - (center.x - state.pan.x) * zoomRatio,
                y: center.y - (center.y - state.pan.y) * zoomRatio
            };

            set({ zoom: clampedZoom, pan: newPan });
        } else {
            set({ zoom: clampedZoom });
        }
    },

    resetView: () => set({ pan: { x: 0, y: 0 }, zoom: DEFAULT_ZOOM }),

    // Interaction Actions
    setDragging: (isDragging) => set({ isDragging }),
    setPanning: (isPanning) => set({ isPanning }),

    startConnecting: (nodeId, portIdOrIds) => {
        const sources = Array.isArray(portIdOrIds)
            ? portIdOrIds.map(pid => ({ nodeId, portId: pid }))
            : [{ nodeId, portId: portIdOrIds }];

        set({
            isConnecting: true,
            connectingFrom: sources
        });
    },

    stopConnecting: () => set({
        isConnecting: false,
        connectingFrom: null
    }),

    toggleGhostMode: () => set((state) => ({ ghostMode: !state.ghostMode })),

    // Coordinate Transforms
    screenToCanvas: (screenPos) => {
        const { pan, zoom } = get();
        return {
            x: (screenPos.x - pan.x) / zoom,
            y: (screenPos.y - pan.y) / zoom
        };
    },

    canvasToScreen: (canvasPos) => {
        const { pan, zoom } = get();
        return {
            x: canvasPos.x * zoom + pan.x,
            y: canvasPos.y * zoom + pan.y
        };
    }
}));
