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

    return (
        <div className={`keyboard-node schematic-node ${isActive ? 'active' : ''}`}>
            {/* Header */}
            <div className="schematic-header">
                <span className="schematic-title">Keyboard</span>
                <span className="keyboard-assigned-key">{assignedKey}</span>
            </div>

            {/* Horizontal Rows Container */}
            <div className="keyboard-schematic-body">
                {/* Row Labels (1, 2, 3) */}
                <div className="keyboard-row-indicators">
                    <div className="row-indicator">1</div>
                    <div className="row-indicator">2</div>
                    <div className="row-indicator">3</div>
                </div>

                {/* Output Ports Row */}
                {/* Note: The ports are rendered by NodeWrapper, but for schematic nodes 
                    we might want to position them specifically. 
                    However, NodeWrapper handles port rendering. 
                    To match the sketch, we need the NodeWrapper to render ports IN HERE 
                    or render them invisibly and we use custom targets?
                    
                    Actually, NodeWrapper renders ports absolute/relative to the node. 
                    If I change CSS to `display: flex` and hide default ports, 
                    I can maybe force them into position? 
                    
                    Better approach for now: 
                    The NodeWrapper renders ports in `.node-ports`. 
                    We need to style `.node-ports` for this specific node type OR 
                    hide default ports and render custom "handles" that link to the ports?
                    But standard practice in this codebase seems to be NodeWrapper handles ports.
                    
                    Let's look at `SpeakerNode` I just did.
                    I didn't add ports there. The wrapper adds them.
                    For Speaker, it has 1 input. Wrapper puts it on left.
                    For Keyboard, 3 outputs. Wrapper puts them on right.
                     Sketch has them at BOTTOM or inside body.
                    
                    If connection points need to be inside, I might need to refactor NodeWrapper 
                    or use a portal/teleport mechanism. 
                    OR I can style `.node-ports` via CSS for `.keyboard-node`.
                    
                    Let's assume for now I will style them in CSS to position them below the numbers.
                */}
            </div>

            {/* Visual hint for active state */}
            {isActive && <div className="active-indicator-glow" />}
        </div>
    );
}
