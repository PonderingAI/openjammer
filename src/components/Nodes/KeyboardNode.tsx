/**
 * Keyboard Node - Routes keyboard input to connected instruments
 * 
 * Auto-assigns a number key (2-9) when created
 * Pressing that number key activates this keyboard's input mode
 * Q-M rows then send input to connected instruments
 */

import { useEffect, useCallback } from 'react';
import type { GraphNode } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { useAudioStore } from '../../store/audioStore';

interface KeyboardNodeProps {
    node: GraphNode;
}

interface KeyboardNodeData {
    assignedKey: number; // 2-9
    activeRow: number | null; // Which row is currently pressed
    rowOctaves: number[];
}

export function KeyboardNode({ node }: KeyboardNodeProps) {
    const data = node.data as unknown as KeyboardNodeData;
    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const activeKeyboardId = useAudioStore((s) => s.activeKeyboardId);
    const setActiveKeyboard = useAudioStore((s) => s.setActiveKeyboard);

    const isActive = activeKeyboardId === node.id;
    const assignedKey = data.assignedKey ?? 2;

    // Listen for assigned number key to activate this keyboard
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.target as HTMLElement).tagName === 'INPUT') return;

            // Check if this keyboard's assigned key was pressed
            if (e.key === String(assignedKey)) {
                e.preventDefault();
                setActiveKeyboard(isActive ? null : node.id);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [assignedKey, isActive, node.id, setActiveKeyboard]);

    // Handle octave adjustment for each row
    const handleRowOctaveChange = useCallback((row: number, delta: number) => {
        const rowOctaves = data.rowOctaves || [4, 4, 4];
        const newOctaves = [...rowOctaves];
        newOctaves[row] = Math.max(0, Math.min(8, newOctaves[row] + delta));
        updateNodeData(node.id, { rowOctaves: newOctaves });
    }, [data.rowOctaves, node.id, updateNodeData]);

    const rowOctaves = data.rowOctaves || [4, 4, 4];

    return (
        <div className="keyboard-node">
            {/* Header with assigned key */}
            <div className="keyboard-node-header">
                <span className="keyboard-key-badge">{assignedKey}</span>
                <span className={`keyboard-status ${isActive ? 'active' : ''}`}>
                    {isActive ? 'ACTIVE' : 'Press ' + assignedKey}
                </span>
            </div>

            {/* Three rows with octave controls */}
            <div className="keyboard-rows">
                {[0, 1, 2].map((rowIndex) => (
                    <div key={rowIndex} className="keyboard-row">
                        <div className="keyboard-row-label">
                            {rowIndex === 0 ? 'Q-P' : rowIndex === 1 ? 'A-L' : 'Z-/'}
                        </div>
                        <div className="keyboard-row-octave">
                            <button
                                className="octave-btn"
                                onClick={() => handleRowOctaveChange(rowIndex, -1)}
                            >
                                −
                            </button>
                            <span className="octave-value">C{rowOctaves[rowIndex]}</span>
                            <button
                                className="octave-btn"
                                onClick={() => handleRowOctaveChange(rowIndex, 1)}
                            >
                                +
                            </button>
                        </div>
                        {/* Output port indicator */}
                        <div className={`row-output ${isActive ? 'glowing' : ''}`} />
                    </div>
                ))}
            </div>
        </div>
    );
}
