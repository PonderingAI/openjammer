/**
 * Help Panel - Keyboard shortcuts and tips
 */

import { useState } from 'react';

export function HelpPanel() {
    const [isVisible, setIsVisible] = useState(true);

    if (!isVisible) {
        return (
            <button
                className="toolbar-btn"
                onClick={() => setIsVisible(true)}
                style={{
                    position: 'fixed',
                    bottom: 'var(--space-md)',
                    left: 'var(--space-md)',
                    background: 'var(--bg-node)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-lg)',
                    zIndex: 100
                }}
            >
                ❓ Help
            </button>
        );
    }

    return (
        <div className="help-panel">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3>🎹 OpenJammer</h3>
                <button
                    onClick={() => setIsVisible(false)}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        cursor: 'pointer'
                    }}
                >
                    ✕
                </button>
            </div>

            <ul>
                <li><kbd>Right Click</kbd> Add nodes</li>
                <li><kbd>Drag</kbd> Box select</li>
                <li><kbd>Alt + Drag</kbd> Pan canvas</li>
                <li><kbd>Scroll</kbd> Zoom in/out</li>
                <li><kbd>W</kbd> Ghost Mode</li>
                <li><kbd>Delete</kbd> Remove selected</li>
                <li><kbd>Ctrl+Z</kbd> Undo</li>
                <li><kbd>Ctrl+Y</kbd> Redo</li>
            </ul>

            <div style={{
                marginTop: 'var(--space-sm)',
                paddingTop: 'var(--space-sm)',
                borderTop: '1px solid var(--border-subtle)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)'
            }}>
                <strong>Keyboard:</strong> Q-P (high), A-L (mid), Z-/ (low)
            </div>
        </div>
    );
}
