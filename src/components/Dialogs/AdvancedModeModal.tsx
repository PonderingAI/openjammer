/**
 * Advanced Mode Modal - Universal modal for configuring node bundle connections
 *
 * Features:
 * - Press 'E' on any selected node to open
 * - 16:9 aspect ratio modal overlay
 * - Left: Internal structure (node-specific)
 * - Center: Connection canvas (draw connections between internals and bundles)
 * - Right: Dynamic bundle ports (auto-create on connect)
 */

import type { GraphNode } from '../../engine/types';
import { InternalStructurePanel } from './InternalStructurePanel';
import { BundlePortsPanel } from './BundlePortsPanel';
import { ModalConnectionCanvas } from './ModalConnectionCanvas';
import './AdvancedModeModal.css';

interface AdvancedModeModalProps {
    node: GraphNode;
    onClose: () => void;
}

export function AdvancedModeModal({ node, onClose }: AdvancedModeModalProps) {
    const nodeName = typeof node.data.name === 'string' ? node.data.name : node.type;

    return (
        <div className="advanced-mode-overlay" onClick={onClose}>
            <div className="advanced-mode-modal" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="modal-header">
                    <h2>{nodeName} - Advanced View</h2>
                    <button className="close-btn" onClick={onClose}>
                        × <span className="esc-hint">esc</span>
                    </button>
                </div>

                {/* Body: 3-column layout */}
                <div className="modal-body">
                    {/* Left: Internal structure (node-specific) */}
                    <div className="internal-panel">
                        <InternalStructurePanel node={node} />
                    </div>

                    {/* Center: Connection canvas */}
                    <div className="connection-canvas">
                        <ModalConnectionCanvas node={node} />
                    </div>

                    {/* Right: Dynamic bundle ports */}
                    <div className="bundle-panel">
                        <BundlePortsPanel node={node} />
                    </div>
                </div>
            </div>
        </div>
    );
}
