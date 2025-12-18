/**
 * Audio Store - Manages audio engine state, keyboard mapping, and mode switching
 */

import { create } from 'zustand';
import { audioGraphManager } from '../audio/AudioGraphManager';

// ============================================================================
// Store Interface
// ============================================================================

interface AudioStore {
    // Audio Context State
    isAudioContextReady: boolean;
    setAudioContextReady: (ready: boolean) => void;

    // Mode Switching (key 1 = config mode, 2-9 = keyboard nodes)
    currentMode: number; // 1 = config, 2-9 = keyboard node modes
    setCurrentMode: (mode: number) => void;

    // Tracks if current mode has no keyboard assigned (for warning display)
    isModeUnassigned: boolean;

    // Active Keyboard Node (when in mode 2-9)
    activeKeyboardId: string | null;
    setActiveKeyboard: (keyboardId: string | null) => void;

    // Keyboard number to node ID mapping
    keyboardNumberMap: Map<number, string>;
    registerKeyboard: (num: number, nodeId: string) => void;
    unregisterKeyboard: (num: number) => void;
    getKeyboardByNumber: (num: number) => string | null;

    // Active Keys (for visual feedback)
    activeKeys: Set<string>;
    pressKey: (key: string) => void;
    releaseKey: (key: string) => void;
    clearActiveKeys: () => void;

    // Keyboard signal emission (triggers notes on connected instruments)
    emitKeyboardSignal: (keyboardId: string, row: number, keyIndex: number) => void;
    releaseKeyboardSignal: (keyboardId: string, row: number, keyIndex: number) => void;

    // Used keyboard numbers tracking (for auto-assignment)
    usedKeyboardNumbers: Set<number>;
    claimKeyboardNumber: (num: number) => void;
    releaseKeyboardNumber: (num: number) => void;
    getNextFreeKeyboardNumber: () => number;
}

export const useAudioStore = create<AudioStore>((set, get) => ({
    // Audio Context State
    isAudioContextReady: false,
    setAudioContextReady: (ready) => set({ isAudioContextReady: ready }),

    // Mode Switching
    currentMode: 1, // Start in config mode
    setCurrentMode: (mode) => {
        const state = get();
        // Check if mode 2-9 has a keyboard assigned
        const isModeUnassigned = mode >= 2 && mode <= 9 && !state.keyboardNumberMap.has(mode);

        // If switching to a keyboard mode, also set the active keyboard
        if (mode >= 2 && mode <= 9) {
            const keyboardId = state.keyboardNumberMap.get(mode) || null;
            set({
                currentMode: mode,
                isModeUnassigned,
                activeKeyboardId: keyboardId
            });
        } else {
            set({
                currentMode: mode,
                isModeUnassigned: false,
                activeKeyboardId: null
            });
        }
    },
    isModeUnassigned: false,

    // Active Keyboard
    activeKeyboardId: null,
    setActiveKeyboard: (keyboardId) => set({ activeKeyboardId: keyboardId }),

    // Keyboard number mapping
    keyboardNumberMap: new Map(),
    registerKeyboard: (num, nodeId) => set((state) => {
        const newMap = new Map(state.keyboardNumberMap);
        newMap.set(num, nodeId);
        // Update isModeUnassigned if current mode now has a keyboard
        const isModeUnassigned = state.currentMode >= 2 && state.currentMode <= 9 && !newMap.has(state.currentMode);
        return { keyboardNumberMap: newMap, isModeUnassigned };
    }),
    unregisterKeyboard: (num) => set((state) => {
        const newMap = new Map(state.keyboardNumberMap);
        newMap.delete(num);
        // Update isModeUnassigned if current mode lost its keyboard
        const isModeUnassigned = state.currentMode >= 2 && state.currentMode <= 9 && !newMap.has(state.currentMode);
        return { keyboardNumberMap: newMap, isModeUnassigned };
    }),
    getKeyboardByNumber: (num) => get().keyboardNumberMap.get(num) || null,

    // Active Keys
    activeKeys: new Set(),

    pressKey: (key) => set((state) => {
        const newActiveKeys = new Set(state.activeKeys);
        newActiveKeys.add(key);
        return { activeKeys: newActiveKeys };
    }),

    releaseKey: (key) => set((state) => {
        const newActiveKeys = new Set(state.activeKeys);
        newActiveKeys.delete(key);
        return { activeKeys: newActiveKeys };
    }),

    clearActiveKeys: () => set({ activeKeys: new Set() }),

    // Keyboard signal emission
    emitKeyboardSignal: (keyboardId, row, keyIndex) => {
        // Track active key for visual feedback
        const keyId = `${keyboardId}-${row}-${keyIndex}`;
        set(state => ({
            activeKeys: new Set(state.activeKeys).add(keyId)
        }));

        // Trigger note on connected instruments via AudioGraphManager
        audioGraphManager.triggerKeyboardNote(keyboardId, row, keyIndex);
    },

    releaseKeyboardSignal: (keyboardId, row, keyIndex) => {
        // Remove active key
        const keyId = `${keyboardId}-${row}-${keyIndex}`;
        set(state => {
            const newKeys = new Set(state.activeKeys);
            newKeys.delete(keyId);
            return { activeKeys: newKeys };
        });

        // Release note on connected instruments
        audioGraphManager.releaseKeyboardNote(keyboardId, row, keyIndex);
    },

    // Keyboard Number Management
    usedKeyboardNumbers: new Set(),

    claimKeyboardNumber: (num) => set((state) => {
        const newUsed = new Set(state.usedKeyboardNumbers);
        newUsed.add(num);
        return { usedKeyboardNumbers: newUsed };
    }),

    releaseKeyboardNumber: (num) => set((state) => {
        const newUsed = new Set(state.usedKeyboardNumbers);
        newUsed.delete(num);
        return { usedKeyboardNumbers: newUsed };
    }),

    getNextFreeKeyboardNumber: () => {
        const used = get().usedKeyboardNumbers;
        for (let i = 2; i <= 9; i++) {
            if (!used.has(i)) return i;
        }
        return 2; // Fallback to 2 if all used
    }
}));
