/**
 * Help Panel - Keyboard shortcuts, mode indicator, and tips
 */

import { useState } from 'react';
import { useAudioStore } from '../../store/audioStore';

export function HelpPanel() {
    const [isVisible, setIsVisible] = useState(true);

    const currentMode = useAudioStore((s) => s.currentMode);
    const isModeUnassigned = useAudioStore((s) => s.isModeUnassigned);

    // Get mode description
    const getModeLabel = () => {
        if (currentMode === 1) return 'Config';
        return `Keyboard ${currentMode}`;
    };

    if (!isVisible) {
        return (
            <button
                className={`toolbar-btn help-btn-minimized ${isModeUnassigned ? 'warning' : ''}`}
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
                {isModeUnassigned ? '⚠️' : '❓'} Help
            </button>
        );
    }

    return (
        <div className={`help-panel ${isModeUnassigned ? 'help-panel-warning' : ''}`}>
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

            {/* Mode Indicator */}
            <div className="help-mode-indicator">
                <span className="help-mode-label">Mode:</span>
                <span className={`help-mode-value ${currentMode === 1 ? 'mode-config' : 'mode-keyboard'}`}>
                    <kbd>{currentMode}</kbd> {getModeLabel()}
                </span>
            </div>

            {/* Warning for unassigned mode */}
            {isModeUnassigned && (
                <div className="help-mode-warning">
                    <span className="warning-icon">⚠️</span>
                    <span>No keyboard assigned to key {currentMode}. Create a Keyboard node and set its number to {currentMode}.</span>
                </div>
            )}

            <ul>
                <li><kbd>1</kbd> Config mode (toolbar)</li>
                <li><kbd>2-9</kbd> Keyboard modes</li>
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
