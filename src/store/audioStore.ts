/**
 * Audio Store - Manages audio engine state, keyboard mapping, and mode switching
 */

import { create } from 'zustand';

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

    // Active Keyboard Node (when in mode 2-9)
    activeKeyboardId: string | null;
    setActiveKeyboard: (keyboardId: string | null) => void;

    // Active Keys (for visual feedback)
    activeKeys: Set<string>;
    pressKey: (key: string) => void;
    releaseKey: (key: string) => void;
    clearActiveKeys: () => void;

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
    setCurrentMode: (mode) => set({ currentMode: mode }),

    // Active Keyboard
    activeKeyboardId: null,
    setActiveKeyboard: (keyboardId) => set({ activeKeyboardId: keyboardId }),

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
