/**
 * Keyboard Internal View - Shows all 30 individual key outputs
 *
 * Layout:
 * - Row 1 (Q-P): 10 keys → C4-B4
 * - Row 2 (A-L): 9 keys → C3-A3
 * - Row 3 (Z-/): 10 keys → C2-B2
 */

import type { GraphNode } from '../../engine/types';

interface KeyboardInternalViewProps {
    node: GraphNode;
}

const KEY_ROWS = {
    row1: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    row2: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    row3: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/']
};

const ROW_LABELS = {
    row1: 'Row 1 (C4-B4)',
    row2: 'Row 2 (C3-A3)',
    row3: 'Row 3 (C2-B2)'
};

export function KeyboardInternalView({ node: _node }: KeyboardInternalViewProps) {
    return (
        <div className="internal-ports keyboard-internal">
            <h3>Internal Keys</h3>
            <div className="keyboard-rows">
                {(Object.keys(KEY_ROWS) as Array<keyof typeof KEY_ROWS>).map((rowKey) => (
                    <div key={rowKey} className="keyboard-row-section">
                        <div className="row-label">{ROW_LABELS[rowKey]}</div>
                        <div className="key-list">
                            {KEY_ROWS[rowKey].map(key => (
                                <div key={key} className="key-port-item">
                                    <span className="key-label">{key.toUpperCase()}</span>
                                    <div
                                        className="port-dot output"
                                        data-port-id={`internal-key-${key}`}
                                        data-port-type="internal-output"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
