/**
 * MIDIIntegration - Global MIDI device detection and management
 *
 * Handles:
 * - MIDI initialization on mount
 * - Auto-reconnection to devices based on deviceSignature
 * - Auto-detect popup when new device connects (if no node exists)
 * - Adding MIDI nodes to the canvas with stable device signatures
 * - Preventing duplicate nodes for the same device
 * - Opening the MIDI device browser
 */

import { useEffect, useCallback, useMemo } from 'react';
import { useMIDIStore } from '../../store/midiStore';
import { useGraphStore } from '../../store/graphStore';
import { useCanvasStore } from '../../store/canvasStore';
import { MIDIAutoDetectToast } from './MIDIAutoDetectToast';
import { MIDIDeviceBrowser } from './MIDIDeviceBrowser';
import { getPresetRegistry } from '../../midi';
import type { NodeType, MIDIInputNodeData, MIDIDeviceSignature } from '../../engine/types';

/**
 * Map preset IDs to node types
 */
function getNodeTypeForPreset(presetId: string): NodeType {
    switch (presetId) {
        case 'arturia-minilab-3':
            return 'minilab-3';
        default:
            return 'midi';
    }
}

/**
 * Calculate canvas position from screen center, accounting for pan and zoom
 */
function getCanvasCenterPosition(): { x: number; y: number } {
    const { pan, zoom } = useCanvasStore.getState();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Convert screen center to canvas coordinates
    // Screen position = (canvasPosition * zoom) + pan
    // So: canvasPosition = (screenPosition - pan) / zoom
    const screenCenterX = viewportWidth / 2;
    const screenCenterY = viewportHeight / 2;

    return {
        x: (screenCenterX - pan.x) / zoom + (Math.random() * 100 - 50),
        y: (screenCenterY - pan.y) / zoom + (Math.random() * 100 - 50),
    };
}

export function MIDIIntegration() {
    // MIDI store state
    const isSupported = useMIDIStore((s) => s.isSupported);
    const isInitialized = useMIDIStore((s) => s.isInitialized);
    const initialize = useMIDIStore((s) => s.initialize);
    const pendingDevice = useMIDIStore((s) => s.pendingDevice);
    const dismissPendingDevice = useMIDIStore((s) => s.dismissPendingDevice);
    const browserTargetNodeId = useMIDIStore((s) => s.browserTargetNodeId);
    const inputs = useMIDIStore((s) => s.inputs);
    const generateDeviceName = useMIDIStore((s) => s.generateDeviceName);
    const getDeviceBySignature = useMIDIStore((s) => s.getDeviceBySignature);

    // Graph store for adding nodes
    const addNode = useGraphStore((s) => s.addNode);
    const updateNodeData = useGraphStore((s) => s.updateNodeData);
    const nodes = useGraphStore((s) => s.nodes);

    // Initialize MIDI on mount
    useEffect(() => {
        if (isSupported && !isInitialized) {
            initialize();
        }
    }, [isSupported, isInitialized, initialize]);

    // Auto-reconnect MIDI nodes when devices become available
    useEffect(() => {
        if (!isInitialized) return;

        // Find all MIDI nodes that have signatures but are disconnected
        for (const node of nodes.values()) {
            const data = node.data as MIDIInputNodeData;
            if (!data?.deviceSignature) continue;
            if (data.isConnected && data.deviceId) continue; // Already connected

            // Try to find a matching device
            const device = getDeviceBySignature(data.deviceSignature);
            if (device) {
                console.log(`[MIDI] Auto-reconnecting ${data.deviceSignature.deviceName} to ${device.name}`);
                updateNodeData(node.id, {
                    deviceId: device.id,
                    isConnected: true,
                });
            }
        }
    }, [isInitialized, inputs, nodes, getDeviceBySignature, updateNodeData]);

    // Check if a device already has a node on the canvas (by deviceId or signature)
    const deviceHasNode = useCallback((deviceId: string): boolean => {
        for (const node of nodes.values()) {
            if (node.data?.deviceId === deviceId) {
                return true;
            }
        }
        return false;
    }, [nodes]);

    // Check if a signature already has a node on the canvas
    const signatureHasNode = useCallback((presetId: string, deviceName: string): boolean => {
        for (const node of nodes.values()) {
            const sig = (node.data as MIDIInputNodeData)?.deviceSignature;
            if (sig?.presetId === presetId && sig?.deviceName === deviceName) {
                return true;
            }
        }
        return false;
    }, [nodes]);

    // Check if pending device already has a node
    const pendingDeviceHasNode = useMemo(() => {
        if (!pendingDevice) return false;
        return deviceHasNode(pendingDevice.id);
    }, [pendingDevice, deviceHasNode]);

    // Handle adding a device from the auto-detect toast
    const handleAddDevice = useCallback((deviceId: string, presetId: string) => {
        // Get preset name for auto-naming
        const registry = getPresetRegistry();
        const preset = registry.getPreset(presetId);
        const presetName = preset?.name || 'MIDI Device';

        // Generate device name (auto-names like "MiniLab 3", "MiniLab 3 2", etc.)
        const deviceName = generateDeviceName(deviceId, presetId, presetName);

        // Check if this signature already has a node
        if (signatureHasNode(presetId, deviceName)) {
            console.log(`[MIDI] Device with signature ${presetId}:${deviceName} already has a node`);
            dismissPendingDevice();
            return;
        }

        // Create signature for stable identification
        const deviceSignature: MIDIDeviceSignature = {
            presetId,
            deviceName,
        };

        // Get node type based on preset
        const nodeType = getNodeTypeForPreset(presetId);

        // Calculate position - center of canvas view with some randomness
        const position = getCanvasCenterPosition();

        // Add the node to the canvas with stable signature
        addNode(nodeType, position, null, {
            deviceId,
            deviceSignature,
            presetId,
            isConnected: true,
            activeChannel: 0,
        });
    }, [addNode, generateDeviceName, signatureHasNode, dismissPendingDevice]);

    // Handle selecting a device from the browser
    const handleSelectDevice = useCallback((deviceId: string | null, presetId: string) => {
        // If we have a target node (opened browser from existing MIDI node), update that node
        if (browserTargetNodeId) {
            // If switching to a new device, update signature too
            if (deviceId) {
                const registry = getPresetRegistry();
                const preset = registry.getPreset(presetId);
                const presetName = preset?.name || 'MIDI Device';
                const deviceName = generateDeviceName(deviceId, presetId, presetName);

                updateNodeData(browserTargetNodeId, {
                    deviceId,
                    deviceSignature: { presetId, deviceName },
                    presetId,
                    isConnected: true,
                });
            } else {
                updateNodeData(browserTargetNodeId, {
                    deviceId: null,
                    isConnected: false,
                });
            }
            return;
        }

        // Otherwise, create a new node
        if (!deviceId) return; // Don't create node without device

        const registry = getPresetRegistry();
        const preset = registry.getPreset(presetId);
        const presetName = preset?.name || 'MIDI Device';
        const deviceName = generateDeviceName(deviceId, presetId, presetName);

        // Check if this signature already has a node
        if (signatureHasNode(presetId, deviceName)) {
            console.log(`[MIDI] Device with signature ${presetId}:${deviceName} already has a node`);
            return;
        }

        const deviceSignature: MIDIDeviceSignature = {
            presetId,
            deviceName,
        };

        const nodeType = getNodeTypeForPreset(presetId);
        const position = getCanvasCenterPosition();

        addNode(nodeType, position, null, {
            deviceId,
            deviceSignature,
            presetId,
            isConnected: true,
            activeChannel: 0,
        });
    }, [browserTargetNodeId, addNode, updateNodeData, generateDeviceName, signatureHasNode]);

    // Auto-dismiss pending device if it already has a node
    useEffect(() => {
        if (pendingDeviceHasNode) {
            dismissPendingDevice();
        }
    }, [pendingDeviceHasNode, dismissPendingDevice]);

    return (
        <>
            {/* Auto-detect toast - only show if device doesn't already have a node */}
            {!pendingDeviceHasNode && (
                <MIDIAutoDetectToast onAddDevice={handleAddDevice} />
            )}

            {/* MIDI Device Browser */}
            <MIDIDeviceBrowser onSelectDevice={handleSelectDevice} />
        </>
    );
}
