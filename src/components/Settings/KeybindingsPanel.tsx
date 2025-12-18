/**
 * KeybindingsPanel - UI for viewing and customizing keyboard shortcuts
 */

import { useState, useEffect, useCallback } from 'react';
import {
    useKeybindingsStore,
    keybindingActions,
    keyComboToString,
    type KeyCombo,
} from '../../store/keybindingsStore';
import './KeybindingsPanel.css';

interface EditingState {
    actionId: string;
    pressedKeys: KeyCombo | null;
}

export function KeybindingsPanel() {
    const { getBinding, setBinding, resetBinding, resetAllBindings, customBindings } = useKeybindingsStore();
    const [editing, setEditing] = useState<EditingState | null>(null);

    // Group actions by category
    const categorizedActions = keybindingActions.reduce((acc, action) => {
        if (!acc[action.category]) {
            acc[action.category] = [];
        }
        acc[action.category].push(action);
        return acc;
    }, {} as Record<string, typeof keybindingActions>);

    // Handle key capture when editing
    useEffect(() => {
        if (!editing) return;

        function handleKeyDown(e: KeyboardEvent) {
            e.preventDefault();
            e.stopPropagation();

            // Escape cancels editing
            if (e.key === 'Escape') {
                setEditing(null);
                return;
            }

            // Ignore modifier-only keys
            if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) {
                return;
            }

            const combo: KeyCombo = {
                key: e.key,
                ctrl: e.ctrlKey,
                meta: e.metaKey,
                shift: e.shiftKey,
                alt: e.altKey,
            };

            // Clean up the combo - remove false values
            if (!combo.ctrl) delete combo.ctrl;
            if (!combo.meta) delete combo.meta;
            if (!combo.shift) delete combo.shift;
            if (!combo.alt) delete combo.alt;

            setEditing((prev) => prev ? { ...prev, pressedKeys: combo } : null);
        }

        function handleKeyUp() {
            // When user releases keys with a valid combo, save it
            if (editing?.pressedKeys) {
                setBinding(editing.actionId, editing.pressedKeys);
                setEditing(null);
            }
        }

        window.addEventListener('keydown', handleKeyDown, true);
        window.addEventListener('keyup', handleKeyUp, true);

        return () => {
            window.removeEventListener('keydown', handleKeyDown, true);
            window.removeEventListener('keyup', handleKeyUp, true);
        };
    }, [editing, setBinding]);

    const startEditing = useCallback((actionId: string) => {
        setEditing({ actionId, pressedKeys: null });
    }, []);

    const handleReset = useCallback((actionId: string) => {
        resetBinding(actionId);
    }, [resetBinding]);

    const handleResetAll = useCallback(() => {
        if (confirm('Reset all keybindings to defaults?')) {
            resetAllBindings();
        }
    }, [resetAllBindings]);

    return (
        <div className="keybindings-panel">
            <div className="keybindings-header">
                <p className="keybindings-description">
                    Click on a shortcut to change it. Press Escape to cancel.
                </p>
                <button
                    className="keybindings-reset-all"
                    onClick={handleResetAll}
                    disabled={Object.keys(customBindings).length === 0}
                >
                    Reset All to Defaults
                </button>
            </div>

            {Object.entries(categorizedActions).map(([category, actions]) => (
                <div key={category} className="keybindings-category">
                    <h4 className="keybindings-category-title">{category}</h4>

                    <div className="keybindings-list">
                        {actions.map((action) => {
                            const currentBinding = getBinding(action.id);
                            const isEditing = editing?.actionId === action.id;
                            const isCustomized = customBindings[action.id] !== undefined;

                            return (
                                <div
                                    key={action.id}
                                    className={`keybindings-row ${isEditing ? 'keybindings-row-editing' : ''}`}
                                >
                                    <span className="keybindings-label">{action.label}</span>

                                    <div className="keybindings-controls">
                                        {isEditing ? (
                                            <span className="keybindings-shortcut keybindings-shortcut-editing">
                                                {editing.pressedKeys
                                                    ? keyComboToString(editing.pressedKeys)
                                                    : 'Press keys...'}
                                            </span>
                                        ) : (
                                            <button
                                                className={`keybindings-shortcut ${isCustomized ? 'keybindings-shortcut-custom' : ''}`}
                                                onClick={() => startEditing(action.id)}
                                            >
                                                {currentBinding ? keyComboToString(currentBinding) : 'None'}
                                            </button>
                                        )}

                                        {isCustomized && !isEditing && (
                                            <button
                                                className="keybindings-reset"
                                                onClick={() => handleReset(action.id)}
                                                title="Reset to default"
                                            >
                                                ↺
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
