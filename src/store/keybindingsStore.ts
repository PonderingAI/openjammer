/**
 * Keybindings Store - Manages customizable keyboard shortcuts
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ============================================================================
// Types
// ============================================================================

export interface KeyCombo {
    key: string;           // The main key (e.g., 'z', 'Delete', '=')
    ctrl?: boolean;        // Ctrl key (Windows/Linux)
    meta?: boolean;        // Cmd key (Mac)
    shift?: boolean;       // Shift key
    alt?: boolean;         // Alt key
}

export interface KeybindingAction {
    id: string;
    label: string;         // Display name
    category: string;      // For grouping in UI
    defaultBinding: KeyCombo;
}

// ============================================================================
// Default Keybindings
// ============================================================================

export const keybindingActions: KeybindingAction[] = [
    // File actions
    {
        id: 'file.new',
        label: 'New Workflow',
        category: 'File',
        defaultBinding: { key: 'n', ctrl: true },
    },
    {
        id: 'file.import',
        label: 'Import Workflow',
        category: 'File',
        defaultBinding: { key: 'o', ctrl: true },
    },
    {
        id: 'file.export',
        label: 'Export Workflow',
        category: 'File',
        defaultBinding: { key: 's', ctrl: true },
    },

    // Edit actions
    {
        id: 'edit.delete',
        label: 'Delete Selected',
        category: 'Edit',
        defaultBinding: { key: 'Delete' },
    },
    {
        id: 'edit.undo',
        label: 'Undo',
        category: 'Edit',
        defaultBinding: { key: 'z', ctrl: true },
    },
    {
        id: 'edit.redo',
        label: 'Redo',
        category: 'Edit',
        defaultBinding: { key: 'z', ctrl: true, shift: true },
    },

    // View actions
    {
        id: 'view.zoomIn',
        label: 'Zoom In',
        category: 'View',
        defaultBinding: { key: '=', ctrl: true },
    },
    {
        id: 'view.zoomOut',
        label: 'Zoom Out',
        category: 'View',
        defaultBinding: { key: '-', ctrl: true },
    },
    {
        id: 'view.resetView',
        label: 'Reset View',
        category: 'View',
        defaultBinding: { key: '0', ctrl: true },
    },
    {
        id: 'view.ghostMode',
        label: 'Toggle Ghost Mode',
        category: 'View',
        defaultBinding: { key: 'w' },
    },

    // Canvas actions
    {
        id: 'canvas.multiConnect',
        label: 'Multi-Connect Mode',
        category: 'Canvas',
        defaultBinding: { key: 'a' },
    },
];

// ============================================================================
// Helpers
// ============================================================================

export function keyComboToString(combo: KeyCombo): string {
    const parts: string[] = [];

    if (combo.ctrl) parts.push('Ctrl');
    if (combo.meta) parts.push('Cmd');
    if (combo.alt) parts.push('Alt');
    if (combo.shift) parts.push('Shift');

    // Format the key nicely
    let keyDisplay = combo.key;
    if (combo.key === ' ') keyDisplay = 'Space';
    else if (combo.key === 'Delete') keyDisplay = 'Del';
    else if (combo.key === 'Backspace') keyDisplay = 'Backspace';
    else if (combo.key.length === 1) keyDisplay = combo.key.toUpperCase();

    parts.push(keyDisplay);

    return parts.join('+');
}

export function matchesKeyCombo(e: KeyboardEvent, combo: KeyCombo): boolean {
    // Check modifiers
    const ctrlOrMeta = e.ctrlKey || e.metaKey;
    const wantsCtrlOrMeta = combo.ctrl || combo.meta;

    if (wantsCtrlOrMeta !== ctrlOrMeta) return false;
    if ((combo.shift ?? false) !== e.shiftKey) return false;
    if ((combo.alt ?? false) !== e.altKey) return false;

    // Check main key (case-insensitive for letters)
    const eventKey = e.key.toLowerCase();
    const comboKey = combo.key.toLowerCase();

    return eventKey === comboKey;
}

// ============================================================================
// Store Interface
// ============================================================================

interface KeybindingsStore {
    // Custom bindings override defaults (action id -> KeyCombo)
    customBindings: Record<string, KeyCombo>;

    // Get the current binding for an action (custom or default)
    getBinding: (actionId: string) => KeyCombo | undefined;

    // Set a custom binding
    setBinding: (actionId: string, combo: KeyCombo) => void;

    // Remove custom binding (revert to default)
    resetBinding: (actionId: string) => void;

    // Reset all to defaults
    resetAllBindings: () => void;

    // Check if a key event matches an action
    matchesAction: (e: KeyboardEvent, actionId: string) => boolean;

    // Get all actions that match a key event
    getMatchingActions: (e: KeyboardEvent) => string[];
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useKeybindingsStore = create<KeybindingsStore>()(
    persist(
        (set, get) => ({
            customBindings: {},

            getBinding: (actionId: string) => {
                const { customBindings } = get();

                // Check for custom binding first
                if (customBindings[actionId]) {
                    return customBindings[actionId];
                }

                // Fall back to default
                const action = keybindingActions.find(a => a.id === actionId);
                return action?.defaultBinding;
            },

            setBinding: (actionId: string, combo: KeyCombo) => {
                set((state) => ({
                    customBindings: {
                        ...state.customBindings,
                        [actionId]: combo,
                    },
                }));
            },

            resetBinding: (actionId: string) => {
                set((state) => {
                    const { [actionId]: _, ...rest } = state.customBindings;
                    return { customBindings: rest };
                });
            },

            resetAllBindings: () => {
                set({ customBindings: {} });
            },

            matchesAction: (e: KeyboardEvent, actionId: string) => {
                const binding = get().getBinding(actionId);
                if (!binding) return false;
                return matchesKeyCombo(e, binding);
            },

            getMatchingActions: (e: KeyboardEvent) => {
                const matching: string[] = [];

                for (const action of keybindingActions) {
                    const binding = get().getBinding(action.id);
                    if (binding && matchesKeyCombo(e, binding)) {
                        matching.push(action.id);
                    }
                }

                return matching;
            },
        }),
        {
            name: 'openjammer-keybindings',
        }
    )
);
