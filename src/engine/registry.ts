/**
 * Node Registry - Defines all available node types and their default configurations
 */

import type { NodeDefinition, NodeType, PortDefinition } from './types';

// ============================================================================
// Port Templates
// ============================================================================

const audioOutput: PortDefinition = {
    id: 'audio-out',
    name: 'Audio Out',
    type: 'audio',
    direction: 'output'
};

const audioInput: PortDefinition = {
    id: 'audio-in',
    name: 'Audio In',
    type: 'audio',
    direction: 'input'
};

const technicalInput: PortDefinition = {
    id: 'tech-in',
    name: 'Input',
    type: 'technical',
    direction: 'input'
};

// ============================================================================
// Node Definitions
// ============================================================================

export const nodeDefinitions: Record<NodeType, NodeDefinition> = {
    // Input Nodes
    keyboard: {
        type: 'keyboard',
        category: 'input',
        name: 'Keyboard',
        description: 'Virtual keyboard controller (auto-assigned key)',
        defaultPorts: [
            { id: 'row-1', name: 'Row 1 (Q-P)', type: 'technical', direction: 'output' },
            { id: 'row-2', name: 'Row 2 (A-L)', type: 'technical', direction: 'output' },
            { id: 'row-3', name: 'Row 3 (Z-/)', type: 'technical', direction: 'output' }
        ],
        defaultData: {
            assignedKey: 2,
            activeRow: null,
            rowOctaves: [4, 4, 4]
        }
    },

    microphone: {
        type: 'microphone',
        category: 'input',
        name: 'Microphone',
        description: 'Live audio input from microphone',
        defaultPorts: [audioOutput],
        defaultData: {
            isMuted: false,
            isActive: true
        }
    },

    // Instruments
    piano: {
        type: 'piano',
        category: 'instruments',
        name: 'Classic Piano',
        description: 'Grand piano instrument',
        defaultPorts: [
            { id: 'input-1', name: 'In 1', type: 'technical', direction: 'input' },
            audioOutput
        ],
        defaultData: {
            offsets: { 'input-1': 0 },
            activeInputs: ['input-1']
        }
    },

    cello: {
        type: 'cello',
        category: 'instruments',
        name: 'Cello',
        description: 'Orchestral cello',
        defaultPorts: [
            { id: 'input-1', name: 'In 1', type: 'technical', direction: 'input' },
            audioOutput
        ],
        defaultData: {
            offsets: { 'input-1': -12 }, // Default octaves lower
            activeInputs: ['input-1']
        }
    },

    electricCello: {
        type: 'electricCello',
        category: 'instruments',
        name: 'Electric Cello',
        description: 'Modern electric cello with saturation and chorus',
        defaultPorts: [
            { id: 'input-1', name: 'In 1', type: 'technical', direction: 'input' },
            audioOutput
        ],
        defaultData: {
            offsets: { 'input-1': -12 }, // Same range as acoustic cello
            activeInputs: ['input-1']
        }
    },

    violin: {
        type: 'violin',
        category: 'instruments',
        name: 'Violin',
        description: 'Orchestral violin',
        defaultPorts: [
            { id: 'input-1', name: 'In 1', type: 'technical', direction: 'input' },
            audioOutput
        ],
        defaultData: {
            offsets: { 'input-1': 12 }, // Higher pitch
            activeInputs: ['input-1']
        }
    },

    saxophone: {
        type: 'saxophone',
        category: 'instruments',
        name: 'Saxophone',
        description: 'Jazz saxophone',
        defaultPorts: [
            { id: 'input-1', name: 'In 1', type: 'technical', direction: 'input' },
            audioOutput
        ],
        defaultData: {
            offsets: { 'input-1': 0 },
            activeInputs: ['input-1']
        }
    },

    // Category Aliases / Defaults
    strings: {
        type: 'cello', // Default string instrument
        category: 'instruments',
        name: 'Strings',
        description: 'String Ensemble',
        defaultPorts: [
            { id: 'input-1', name: 'In 1', type: 'technical', direction: 'input' },
            audioOutput
        ],
        defaultData: { offsets: { 'input-1': -12 } }
    },
    keys: {
        type: 'piano', // Default key instrument
        category: 'instruments',
        name: 'Keys',
        description: 'Keyboards',
        defaultPorts: [
            { id: 'input-1', name: 'In 1', type: 'technical', direction: 'input' },
            audioOutput
        ],
        defaultData: { offsets: { 'input-1': 0 } }
    },
    winds: {
        type: 'saxophone', // Default wind instrument
        category: 'instruments',
        name: 'Winds',
        description: 'Wind Instruments',
        defaultPorts: [
            { id: 'input-1', name: 'In 1', type: 'technical', direction: 'input' },
            audioOutput
        ],
        defaultData: { offsets: { 'input-1': 0 } }
    },

    // Effects & Processing
    looper: {
        type: 'looper',
        category: 'routing',
        name: 'Looper',
        description: 'Record and loop audio with auto-detection',
        defaultPorts: [audioInput, audioOutput],
        defaultData: {
            duration: 10,
            isRecording: false,
            loops: [],
            currentTime: 0
        }
    },

    effect: {
        type: 'effect',
        category: 'effects',
        name: 'Effect',
        description: 'Audio effect processor',
        defaultPorts: [audioInput, audioOutput],
        defaultData: {
            effectType: 'distortion',
            params: { amount: 0.5 }
        }
    },

    amplifier: {
        type: 'amplifier',
        category: 'effects',
        name: 'Amplifier',
        description: 'Gain control for audio signals',
        defaultPorts: [
            audioInput,
            audioOutput,
            { ...technicalInput, id: 'gain-in', name: 'Gain' }
        ],
        defaultData: {
            gain: 1
        }
    },

    // Outputs
    speaker: {
        type: 'speaker',
        category: 'output',
        name: 'Speaker',
        description: 'Audio output to device speakers',
        defaultPorts: [audioInput],
        defaultData: {
            volume: 1,
            isMuted: false,
            deviceId: 'default'
        }
    },

    recorder: {
        type: 'recorder',
        category: 'output',
        name: 'Recorder',
        description: 'Record audio to WAV file',
        defaultPorts: [audioInput],
        defaultData: {
            isRecording: false,
            recordings: []
        }
    }
};

// ============================================================================
// Menu Structure (ComfyUI-style hierarchical)
// ============================================================================

export interface MenuCategory {
    name: string;
    icon: string;
    items: NodeType[];
}

// ============================================================================
// Menu Structure (ComfyUI-style hierarchical)
// ============================================================================

export interface MenuCategory {
    name: string;
    icon: string;
    items: NodeType[];
}

export const menuCategories: MenuCategory[] = [
    {
        name: 'Input',
        icon: '⌨️',
        items: ['keyboard', 'microphone']
    },
    {
        name: 'Instruments',
        icon: '🎻',
        items: ['strings', 'keys', 'winds']
    },
    {
        name: 'Routing',
        icon: '🔄',
        items: ['looper']
    },
    {
        name: 'Effects',
        icon: '✨',
        items: ['effect', 'amplifier']
    },
    {
        name: 'Output',
        icon: '🔊',
        items: ['speaker', 'recorder']
    }
];

// ============================================================================
// Utility Functions
// ============================================================================

export function getNodeDefinition(type: NodeType): NodeDefinition {
    return nodeDefinitions[type];
}

export function canConnect(
    sourcePort: PortDefinition,
    targetPort: PortDefinition
): boolean {
    // Must be same connection type
    if (sourcePort.type !== targetPort.type) {
        return false;
    }

    // For audio (directional): source must be output, target must be input
    if (sourcePort.type === 'audio') {
        return sourcePort.direction === 'output' && targetPort.direction === 'input';
    }

    // For technical (bidirectional): any direction works
    return true;
}
