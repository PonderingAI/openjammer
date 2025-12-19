/**
 * Bundle Ports Panel - Dynamic bundle creation and management
 *
 * Features:
 * - Input bundles (top): Receive from main canvas → distribute to internals
 * - Output bundles (bottom): Collect from internals → send to main canvas
 * - Always show one empty bundle port (auto-creates on connect)
 * - Rename bundles
 * - Show connection count per bundle
 */

import { useCallback } from 'react';
import type { GraphNode, BundlePort, BundleConfig, PortDefinition } from '../../engine/types';
import { useGraphStore } from '../../store/graphStore';
import { BundlePortItem } from './BundlePortItem';

interface BundlePortsPanelProps {
    node: GraphNode;
}

export function BundlePortsPanel({ node }: BundlePortsPanelProps) {
    const updateNodePorts = useGraphStore((s) => s.updateNodePorts);
    const updateNodeData = useGraphStore((s) => s.updateNodeData);

    const bundleConfig: BundleConfig = node.data.bundleConfig || {
        inputBundles: [],
        outputBundles: [],
        internalToBundle: {},
        bundleToInternal: {}
    };

    // Create a new bundle when connecting to empty port
    const createBundle = useCallback((type: 'input' | 'output') => {
        const bundles = type === 'input' ? bundleConfig.inputBundles : bundleConfig.outputBundles;
        const newBundleId = `bundle-${type}-${Date.now()}`;

        const newBundle: BundlePort = {
            id: newBundleId,
            name: `${type === 'input' ? 'In' : 'Out'} Bundle ${bundles.length + 1}`,
            type,
            portIds: []
        };

        // Update config
        const newConfig: BundleConfig = { ...bundleConfig };
        if (type === 'input') {
            newConfig.inputBundles = [...bundles, newBundle];
        } else {
            newConfig.outputBundles = [...bundles, newBundle];
        }

        // Add to node ports (so it appears on main canvas)
        const newPort: PortDefinition = {
            id: newBundleId,
            name: newBundle.name,
            type: 'technical',
            direction: type === 'input' ? 'input' : 'output',
            isBundled: true
        };

        updateNodePorts(node.id, [...node.ports, newPort]);
        updateNodeData(node.id, { bundleConfig: newConfig });
    }, [bundleConfig, node.id, node.ports, updateNodePorts, updateNodeData]);

    // Rename a bundle
    const renameBundle = useCallback((bundleId: string, newName: string) => {
        const newConfig: BundleConfig = { ...bundleConfig };

        // Update bundle name in config
        const bundle = [...newConfig.inputBundles, ...newConfig.outputBundles].find(b => b.id === bundleId);
        if (bundle) {
            bundle.name = newName;
        }

        // Update port name
        const updatedPorts = node.ports.map(port =>
            port.id === bundleId ? { ...port, name: newName } : port
        );

        updateNodePorts(node.id, updatedPorts);
        updateNodeData(node.id, { bundleConfig: newConfig });
    }, [bundleConfig, node.id, node.ports, updateNodePorts, updateNodeData]);

    return (
        <div className="bundle-ports-panel">
            {/* Input Bundles */}
            <div className="bundle-section">
                <h3>Input Bundles</h3>
                <div className="bundle-list">
                    {bundleConfig.inputBundles.map(bundle => (
                        <BundlePortItem
                            key={bundle.id}
                            bundle={bundle}
                            onRename={renameBundle}
                        />
                    ))}
                    <EmptyBundlePort type="input" onCreate={createBundle} />
                </div>
            </div>

            {/* Output Bundles */}
            <div className="bundle-section">
                <h3>Output Bundles</h3>
                <div className="bundle-list">
                    {bundleConfig.outputBundles.map(bundle => (
                        <BundlePortItem
                            key={bundle.id}
                            bundle={bundle}
                            onRename={renameBundle}
                        />
                    ))}
                    <EmptyBundlePort type="output" onCreate={createBundle} />
                </div>
            </div>
        </div>
    );
}

// Empty bundle port - triggers creation on connect
interface EmptyBundlePortProps {
    type: 'input' | 'output';
    onCreate: (type: 'input' | 'output') => void;
}

function EmptyBundlePort({ type, onCreate }: EmptyBundlePortProps) {
    return (
        <div className="bundle-port-item empty">
            <div
                className={`port-dot ${type}`}
                data-port-id={`empty-${type}`}
                data-port-type={`bundle-${type}`}
                onClick={() => onCreate(type)}
            />
            <span className="bundle-placeholder">(connect to create)</span>
        </div>
    );
}
