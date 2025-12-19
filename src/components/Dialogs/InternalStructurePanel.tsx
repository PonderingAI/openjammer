/**
 * Internal Structure Panel - Routes to node-specific internal views
 *
 * Shows the internal ports of a node based on its type:
 * - Keyboard: 30 individual key outputs (Q-P, A-L, Z-/)
 * - Instruments: Individual technical input ports
 * - Generic: All ports that aren't bundled
 */

import type { GraphNode } from '../../engine/types';
import { KeyboardInternalView } from './KeyboardInternalView';
import { InstrumentInternalView } from './InstrumentInternalView';

interface InternalStructurePanelProps {
    node: GraphNode;
}

export function InternalStructurePanel({ node }: InternalStructurePanelProps) {
    switch (node.type) {
        case 'keyboard':
            return <KeyboardInternalView node={node} />;

        case 'piano':
        case 'cello':
        case 'electricCello':
        case 'violin':
        case 'saxophone':
        case 'strings':
        case 'keys':
        case 'winds':
        case 'instrument':
            return <InstrumentInternalView node={node} />;

        default:
            return <GenericInternalView node={node} />;
    }
}

// Generic view for nodes that don't have a specific internal structure
function GenericInternalView({ node }: { node: GraphNode }) {
    const internalPorts = node.ports.filter(p => !p.isBundled);

    if (internalPorts.length === 0) {
        return (
            <div className="internal-ports">
                <p className="placeholder-text">No internal ports available</p>
            </div>
        );
    }

    return (
        <div className="internal-ports">
            <h3>Ports</h3>
            <div className="port-list">
                {internalPorts.map(port => (
                    <div key={port.id} className="port-item">
                        {port.direction === 'input' && (
                            <div
                                className="port-dot input"
                                data-port-id={`internal-${port.id}`}
                                data-port-type="internal-input"
                            />
                        )}
                        <span className="port-label">{port.name}</span>
                        {port.direction === 'output' && (
                            <div
                                className="port-dot output"
                                data-port-id={`internal-${port.id}`}
                                data-port-type="internal-output"
                            />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
