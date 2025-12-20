/**
 * Node Internals - Initialize default internal structure for hierarchical nodes
 */

import type { GraphNode, Connection } from '../engine/types';
import { generateUniqueId } from './idGenerator';

interface InternalStructure {
    internalNodes: Map<string, GraphNode>;
    internalConnections: Map<string, Connection>;  // Changed from Connection[] to Map
    specialNodes: string[]; // IDs of undeletable nodes
    // Port visibility configuration
    showEmptyInputPorts?: boolean;   // Show input-panel ports even if not connected
    showEmptyOutputPorts?: boolean;  // Show output-panel ports even if not connected
}

/**
 * Create default internal structure for a node based on its type
 */
export function createDefaultInternalStructure(parentNode: GraphNode): InternalStructure {
    switch (parentNode.type) {
        case 'keyboard':
            return createKeyboardInternals();

        case 'piano':
        case 'cello':
        case 'electricCello':
        case 'violin':
        case 'saxophone':
        case 'strings':
        case 'keys':
        case 'winds':
            return createInstrumentInternals();

        case 'container':
            return createContainerInternals();

        default:
            return createGenericInternals();
    }
}

/**
 * Keyboard internal structure:
 * - Single keyboard-visual node with 30 per-key output ports
 * - Single output-panel node with 4 labeled ports (Row 1, Row 2, Row 3, Pedal)
 * - Pre-wired connections from each key port to its corresponding port on the output panel
 */
function createKeyboardInternals(): InternalStructure {
    const internalNodes = new Map<string, GraphNode>();
    const internalConnections = new Map<string, Connection>();
    const specialNodes: string[] = [];

    // Keyboard-visual node ports (30 per-key outputs)
    const keyboardVisualPorts = [
        // Row 1 (Q-P): 10 keys
        { id: 'key-q', name: 'Q', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.05 } },
        { id: 'key-w', name: 'W', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.07 } },
        { id: 'key-e', name: 'E', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.09 } },
        { id: 'key-r', name: 'R', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.11 } },
        { id: 'key-t', name: 'T', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.13 } },
        { id: 'key-y', name: 'Y', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.15 } },
        { id: 'key-u', name: 'U', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.17 } },
        { id: 'key-i', name: 'I', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.19 } },
        { id: 'key-o', name: 'O', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.21 } },
        { id: 'key-p', name: 'P', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.23 } },
        // Row 2 (A-L): 9 keys
        { id: 'key-a', name: 'A', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.30 } },
        { id: 'key-s', name: 'S', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.32 } },
        { id: 'key-d', name: 'D', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.34 } },
        { id: 'key-f', name: 'F', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.36 } },
        { id: 'key-g', name: 'G', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.38 } },
        { id: 'key-h', name: 'H', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.40 } },
        { id: 'key-j', name: 'J', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.42 } },
        { id: 'key-k', name: 'K', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.44 } },
        { id: 'key-l', name: 'L', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.46 } },
        // Row 3 (Z-/): 10 keys
        { id: 'key-z', name: 'Z', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.53 } },
        { id: 'key-x', name: 'X', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.55 } },
        { id: 'key-c', name: 'C', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.57 } },
        { id: 'key-v', name: 'V', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.59 } },
        { id: 'key-b', name: 'B', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.61 } },
        { id: 'key-n', name: 'N', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.63 } },
        { id: 'key-m', name: 'M', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.65 } },
        { id: 'key-comma', name: ',', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.67 } },
        { id: 'key-period', name: '.', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.69 } },
        { id: 'key-slash', name: '/', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.71 } },
        // Spacebar
        { id: 'key-space', name: 'Space', type: 'control' as const, direction: 'output' as const, position: { x: 1, y: 0.85 } }
    ];

    // Position constants
    const keyboardX = 100;
    const keyboardY = 100;
    const outputPanelX = 900;
    const outputPanelY = 100;

    // Create single keyboard-visual node
    const keyboardVisualId = generateUniqueId('keyboard-visual-');
    const keyboardVisual: GraphNode = {
        id: keyboardVisualId,
        type: 'keyboard-visual',
        category: 'input',
        position: { x: keyboardX, y: keyboardY },
        data: {},
        ports: keyboardVisualPorts,
        parentId: null,  // Will be set by addNode
        childIds: []
    };
    internalNodes.set(keyboardVisualId, keyboardVisual);
    // NOT added to specialNodes - doesn't appear on parent

    // Create single output-panel node with 4 ports
    const outputPanelId = generateUniqueId('output-panel-');
    const outputPanel: GraphNode = {
        id: outputPanelId,
        type: 'output-panel',
        category: 'routing',
        position: { x: outputPanelX, y: outputPanelY },
        data: {
            portLabels: {
                'port-1': 'Row 1',
                'port-2': 'Row 2',
                'port-3': 'Row 3',
                'port-4': 'Pedal'
            }
        },
        ports: [
            { id: 'port-1', name: 'Row 1', type: 'control', direction: 'input', position: { x: 0, y: 0.15 } },
            { id: 'port-2', name: 'Row 2', type: 'control', direction: 'input', position: { x: 0, y: 0.38 } },
            { id: 'port-3', name: 'Row 3', type: 'control', direction: 'input', position: { x: 0, y: 0.61 } },
            { id: 'port-4', name: 'Pedal', type: 'control', direction: 'input', position: { x: 0, y: 0.84 } }
        ],
        parentId: null,
        childIds: []
    };
    internalNodes.set(outputPanelId, outputPanel);
    specialNodes.push(outputPanelId);  // Added to specialNodes so its ports sync to parent

    // Create input-panel node with one empty placeholder port (for receiving external signals)
    const inputPanelId = generateUniqueId('input-panel-');
    const inputPanel: GraphNode = {
        id: inputPanelId,
        type: 'input-panel',
        category: 'routing',
        position: { x: keyboardX - 200, y: keyboardY },  // Left of keyboard
        data: {
            portLabels: {
                'port-1': ''  // Empty name for placeholder port
            }
        },
        ports: [
            { id: 'port-1', name: '', type: 'control', direction: 'output', position: { x: 1, y: 0.5 } }
        ],
        parentId: null,
        childIds: []
    };
    internalNodes.set(inputPanelId, inputPanel);
    specialNodes.push(inputPanelId);  // Added to specialNodes so its ports sync to parent

    // Key port to output panel port mapping
    const row1Keys = ['key-q', 'key-w', 'key-e', 'key-r', 'key-t', 'key-y', 'key-u', 'key-i', 'key-o', 'key-p'];
    const row2Keys = ['key-a', 'key-s', 'key-d', 'key-f', 'key-g', 'key-h', 'key-j', 'key-k', 'key-l'];
    const row3Keys = ['key-z', 'key-x', 'key-c', 'key-v', 'key-b', 'key-n', 'key-m', 'key-comma', 'key-period', 'key-slash'];

    // Create connections from keyboard-visual key ports to output panel ports
    row1Keys.forEach(keyPortId => {
        const connId = generateUniqueId('conn-');
        internalConnections.set(connId, {
            id: connId,
            sourceNodeId: keyboardVisualId,
            sourcePortId: keyPortId,
            targetNodeId: outputPanelId,
            targetPortId: 'port-1',  // Row 1 port
            type: 'control'
        });
    });

    row2Keys.forEach(keyPortId => {
        const connId = generateUniqueId('conn-');
        internalConnections.set(connId, {
            id: connId,
            sourceNodeId: keyboardVisualId,
            sourcePortId: keyPortId,
            targetNodeId: outputPanelId,
            targetPortId: 'port-2',  // Row 2 port
            type: 'control'
        });
    });

    row3Keys.forEach(keyPortId => {
        const connId = generateUniqueId('conn-');
        internalConnections.set(connId, {
            id: connId,
            sourceNodeId: keyboardVisualId,
            sourcePortId: keyPortId,
            targetNodeId: outputPanelId,
            targetPortId: 'port-3',  // Row 3 port
            type: 'control'
        });
    });

    // Connect spacebar to pedal port
    const spaceConnId = generateUniqueId('conn-');
    internalConnections.set(spaceConnId, {
        id: spaceConnId,
        sourceNodeId: keyboardVisualId,
        sourcePortId: 'key-space',
        targetNodeId: outputPanelId,
        targetPortId: 'port-4',  // Pedal port
        type: 'control'
    });

    return {
        internalNodes,
        internalConnections,
        specialNodes,
        showEmptyInputPorts: false,   // Only show ports with connections
        showEmptyOutputPorts: false   // Only show ports with connections
    };
}

/**
 * Instrument internal structure:
 * - Input nodes for parameters (velocity, pitch, etc.)
 * - 1 Output node (audio)
 * - Pre-wired to instrument controls
 */
function createInstrumentInternals(): InternalStructure {
    const internalNodes = new Map<string, GraphNode>();
    const internalConnections = new Map<string, Connection>();  // Changed from Array to Map
    const specialNodes: string[] = [];

    // Create Input node (receives keys/notes from parent)
    const inputNodeId = generateUniqueId('canvas-input-');
    const inputNode: GraphNode = {
        id: inputNodeId,
        type: 'canvas-input',
        category: 'routing',
        position: { x: 200, y: 300 },
        data: { portName: 'Notes In' },
        ports: [
            { id: 'out', name: 'Out', type: 'control', direction: 'output' }
        ],
        parentId: null,  // Will be set by addNode
        childIds: []
    };
    internalNodes.set(inputNodeId, inputNode);
    specialNodes.push(inputNodeId);

    // Create Output node (sends audio to parent)
    const outputNodeId = generateUniqueId('canvas-output-');
    const outputNode: GraphNode = {
        id: outputNodeId,
        type: 'canvas-output',
        category: 'routing',
        position: { x: 600, y: 300 },
        data: { portName: 'Audio Out' },
        ports: [
            { id: 'in', name: 'In', type: 'audio', direction: 'input' }
        ],
        parentId: null,  // Will be set by addNode
        childIds: []
    };
    internalNodes.set(outputNodeId, outputNode);
    specialNodes.push(outputNodeId);

    // CREATE DEFAULT CONNECTION from notes input to audio output (passthrough)
    const connId = generateUniqueId('conn-');
    internalConnections.set(connId, {
        id: connId,
        sourceNodeId: inputNodeId,
        sourcePortId: 'out',
        targetNodeId: outputNodeId,
        targetPortId: 'in',
        type: 'control'
    });

    return {
        internalNodes,
        internalConnections,
        specialNodes,
        showEmptyInputPorts: false,   // Hide until connected
        showEmptyOutputPorts: false   // Hide until connected
    };
}

/**
 * Generic node internal structure:
 * - 1 Input node
 * - 1 Output node
 * - No pre-wired connections
 */
function createGenericInternals(): InternalStructure {
    const internalNodes = new Map<string, GraphNode>();
    const internalConnections = new Map<string, Connection>();  // Changed from Array to Map
    const specialNodes: string[] = [];

    // Create Input node
    const inputNodeId = generateUniqueId('canvas-input-');
    const inputNode: GraphNode = {
        id: inputNodeId,
        type: 'canvas-input',
        category: 'routing',
        position: { x: 200, y: 300 },
        data: { portName: 'In' },
        ports: [
            { id: 'out', name: 'Out', type: 'control', direction: 'output' }
        ],
        parentId: null,  // Will be set by addNode
        childIds: []
    };
    internalNodes.set(inputNodeId, inputNode);
    specialNodes.push(inputNodeId);

    // Create Output node
    const outputNodeId = generateUniqueId('canvas-output-');
    const outputNode: GraphNode = {
        id: outputNodeId,
        type: 'canvas-output',
        category: 'routing',
        position: { x: 600, y: 300 },
        data: { portName: 'Out' },
        ports: [
            { id: 'in', name: 'In', type: 'control', direction: 'input' }
        ],
        parentId: null,  // Will be set by addNode
        childIds: []
    };
    internalNodes.set(outputNodeId, outputNode);
    specialNodes.push(outputNodeId);

    return {
        internalNodes,
        internalConnections,
        specialNodes,
        showEmptyInputPorts: false,   // Hide until connected
        showEmptyOutputPorts: false   // Hide until connected
    };
}

/**
 * Container node internal structure:
 * - Input panel with 2 ports (becomes 2 inputs on parent's left side)
 * - Output panel with 1 port (becomes 1 output on parent's right side)
 * - No pre-wired connections (user builds inside)
 */
function createContainerInternals(): InternalStructure {
    const internalNodes = new Map<string, GraphNode>();
    const internalConnections = new Map<string, Connection>();
    const specialNodes: string[] = [];

    // Create Input panel with 2 ports (these become inputs on parent node)
    const inputPanelId = generateUniqueId('input-panel-');
    const inputPanel: GraphNode = {
        id: inputPanelId,
        type: 'input-panel',
        category: 'routing',
        position: { x: 150, y: 200 },
        data: {
            portLabels: {
                'port-1': 'In 1',
                'port-2': 'In 2'
            }
        },
        ports: [
            { id: 'port-1', name: 'In 1', type: 'universal', direction: 'output', position: { x: 1, y: 0.33 } },
            { id: 'port-2', name: 'In 2', type: 'universal', direction: 'output', position: { x: 1, y: 0.67 } }
        ],
        parentId: null,
        childIds: []
    };
    internalNodes.set(inputPanelId, inputPanel);
    specialNodes.push(inputPanelId);

    // Create Output panel with 1 port (becomes output on parent node)
    const outputPanelId = generateUniqueId('output-panel-');
    const outputPanel: GraphNode = {
        id: outputPanelId,
        type: 'output-panel',
        category: 'routing',
        position: { x: 650, y: 200 },
        data: {
            portLabels: {
                'port-1': 'Out'
            }
        },
        ports: [
            { id: 'port-1', name: 'Out', type: 'universal', direction: 'input', position: { x: 0, y: 0.5 } }
        ],
        parentId: null,
        childIds: []
    };
    internalNodes.set(outputPanelId, outputPanel);
    specialNodes.push(outputPanelId);

    return {
        internalNodes,
        internalConnections,
        specialNodes,
        showEmptyInputPorts: true,    // Show inputs (users need to see them to connect)
        showEmptyOutputPorts: true    // Show outputs (users need to see them to connect)
    };
}
