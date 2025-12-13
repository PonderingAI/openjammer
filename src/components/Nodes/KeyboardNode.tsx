/**
 * Keyboard Node - Routes keyboard input to connected instruments
 * 
 * Auto-assigns a number key (2-9) when created
 * Pressing that number key activates this keyboard's input mode
 * Q-M rows then send input to connected instruments
 */

import { useEffect } from 'react';
import { useAudioStore } from '../../store/audioStore';

interface KeyboardNodeProps {
    node: import('../../engine/types').GraphNode;
    handlePortClick?: (portId: string, e: React.MouseEvent) => void;
    hasConnection?: (portId: string) => boolean;
    handleHeaderMouseDown?: (e: React.MouseEvent) => void;
}

interface KeyboardNodeData {
    assignedKey: number; // 2-9
    activeRow: number | null; // Which row is currently pressed
    rowOctaves: number[];
}

export function KeyboardNode({ node, handlePortClick, hasConnection, handleHeaderMouseDown }: KeyboardNodeProps) {
    const data = node.data as unknown as KeyboardNodeData;
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

    // Output ports (should match default ports in registry)
    const outputPorts = node.ports.filter(p => p.direction === 'output');

    return (
        <div className={`keyboard-node schematic-node ${isActive ? 'active' : ''}`}>
            {/* Header - Interactive for dragging */}
            <div className="schematic-header" onMouseDown={handleHeaderMouseDown} style={{ cursor: 'grab' }}>
                <span className="schematic-title">Keyboard</span>
                <span className="keyboard-assigned-key">{assignedKey}</span>
            </div>

            {/* Body */}
            <div className="keyboard-schematic-body">
                {/* Visual Guide: 1 2 3 */}
                <div className="keyboard-row-numbers">
                    <div className="row-number">1</div>
                    <div className="row-number">2</div>
                    <div className="row-number">3</div>
                </div>

                {/* Actual Port Circles */}
                <div className="keyboard-row-ports-marker">
                    {/* We expect 3 ports. Map them. */}
                    {outputPorts.map((port) => (
                        <div
                            key={port.id}
                            className={`port-circle-marker interactive ${hasConnection?.(port.id) ? 'connected' : ''}`}
                            onClick={(e) => handlePortClick?.(port.id, e)}
                            title={port.name}
                        />
                    ))}
                    {/* Fallback if less than 3 ports? Should not happen if registry is correct */}
                </div>
            </div>

            {/* Visual hint for active state */}
            {isActive && <div className="active-indicator-glow" />}
        </div>
    );
}
