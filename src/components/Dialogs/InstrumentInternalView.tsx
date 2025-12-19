/**
 * Instrument Internal View - Shows all technical input ports
 *
 * Displays individual input ports that can receive signals from bundle inputs
 */

import type { GraphNode } from '../../engine/types';

interface InstrumentInternalViewProps {
    node: GraphNode;
}

export function InstrumentInternalView({ node }: InstrumentInternalViewProps) {
    // Get all technical input ports (not bundled)
    const technicalPorts = node.ports.filter(
        p => p.type === 'technical' && p.direction === 'input' && !p.isBundled
    );

    if (technicalPorts.length === 0) {
        return (
            <div className="internal-ports">
                <h3>Internal Inputs</h3>
                <p className="placeholder-text">No internal inputs available</p>
            </div>
        );
    }

    return (
        <div className="internal-ports instrument-internal">
            <h3>Internal Inputs</h3>
            <div className="port-list">
                {technicalPorts.map(port => (
                    <div key={port.id} className="port-item">
                        <div
                            className="port-dot input"
                            data-port-id={`internal-${port.id}`}
                            data-port-type="internal-input"
                        />
                        <span className="port-label">{port.name}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
