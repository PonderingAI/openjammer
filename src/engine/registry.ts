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
    direction: 'output',
    position: { x: 1, y: 0.5 }  // Right side, centered
};

const audioInput: PortDefinition = {
    id: 'audio-in',
    name: 'Audio In',
    type: 'audio',
    direction: 'input',
    position: { x: 0, y: 0.5 }  // Left side, centered
};

const controlInput: PortDefinition = {
    id: 'control-in',
    name: 'Control',
    type: 'control',
    direction: 'input',
    position: { x: 0, y: 0.5 }
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
        defaultPorts: [], // Ports generated from internal canvas-input/output nodes
        defaultData: {
            assignedKey: 2,
            activeRow: null,
            rowOctaves: [4, 4, 4]
        },
        dimensions: { width: 160, height: 120 },
        portLayout: {
            direction: 'vertical',
            outputArea: { x: 1, startY: 0.15, endY: 0.85 }
        }
    },

    'keyboard-key': {
        type: 'keyboard-key',
        category: 'input',
        name: 'Key',
        description: 'Individual keyboard key signal generator',
        defaultPorts: [
            {
                id: 'out',
                name: 'Out',
                type: 'control',
                direction: 'output',
                position: { x: 1, y: 0.5 }
            }
        ],
        defaultData: {
            keyLabel: 'Q',
            row: 1,
            keyIndex: 0
        },
        dimensions: { width: 50, height: 50 }
    },

    'keyboard-visual': {
        type: 'keyboard-visual',
        category: 'input',
        name: 'Keyboard',
        description: 'Visual keyboard with per-key outputs',
        defaultPorts: [
            // Row 1 (Q-P): 10 keys - ports on right edge, y: 0.05-0.22
            { id: 'key-q', name: 'Q', type: 'control', direction: 'output', position: { x: 1, y: 0.05 } },
            { id: 'key-w', name: 'W', type: 'control', direction: 'output', position: { x: 1, y: 0.07 } },
            { id: 'key-e', name: 'E', type: 'control', direction: 'output', position: { x: 1, y: 0.09 } },
            { id: 'key-r', name: 'R', type: 'control', direction: 'output', position: { x: 1, y: 0.11 } },
            { id: 'key-t', name: 'T', type: 'control', direction: 'output', position: { x: 1, y: 0.13 } },
            { id: 'key-y', name: 'Y', type: 'control', direction: 'output', position: { x: 1, y: 0.15 } },
            { id: 'key-u', name: 'U', type: 'control', direction: 'output', position: { x: 1, y: 0.17 } },
            { id: 'key-i', name: 'I', type: 'control', direction: 'output', position: { x: 1, y: 0.19 } },
            { id: 'key-o', name: 'O', type: 'control', direction: 'output', position: { x: 1, y: 0.21 } },
            { id: 'key-p', name: 'P', type: 'control', direction: 'output', position: { x: 1, y: 0.23 } },
            // Row 2 (A-L): 9 keys - y: 0.30-0.46
            { id: 'key-a', name: 'A', type: 'control', direction: 'output', position: { x: 1, y: 0.30 } },
            { id: 'key-s', name: 'S', type: 'control', direction: 'output', position: { x: 1, y: 0.32 } },
            { id: 'key-d', name: 'D', type: 'control', direction: 'output', position: { x: 1, y: 0.34 } },
            { id: 'key-f', name: 'F', type: 'control', direction: 'output', position: { x: 1, y: 0.36 } },
            { id: 'key-g', name: 'G', type: 'control', direction: 'output', position: { x: 1, y: 0.38 } },
            { id: 'key-h', name: 'H', type: 'control', direction: 'output', position: { x: 1, y: 0.40 } },
            { id: 'key-j', name: 'J', type: 'control', direction: 'output', position: { x: 1, y: 0.42 } },
            { id: 'key-k', name: 'K', type: 'control', direction: 'output', position: { x: 1, y: 0.44 } },
            { id: 'key-l', name: 'L', type: 'control', direction: 'output', position: { x: 1, y: 0.46 } },
            // Row 3 (Z-/): 10 keys - y: 0.53-0.71
            { id: 'key-z', name: 'Z', type: 'control', direction: 'output', position: { x: 1, y: 0.53 } },
            { id: 'key-x', name: 'X', type: 'control', direction: 'output', position: { x: 1, y: 0.55 } },
            { id: 'key-c', name: 'C', type: 'control', direction: 'output', position: { x: 1, y: 0.57 } },
            { id: 'key-v', name: 'V', type: 'control', direction: 'output', position: { x: 1, y: 0.59 } },
            { id: 'key-b', name: 'B', type: 'control', direction: 'output', position: { x: 1, y: 0.61 } },
            { id: 'key-n', name: 'N', type: 'control', direction: 'output', position: { x: 1, y: 0.63 } },
            { id: 'key-m', name: 'M', type: 'control', direction: 'output', position: { x: 1, y: 0.65 } },
            { id: 'key-comma', name: ',', type: 'control', direction: 'output', position: { x: 1, y: 0.67 } },
            { id: 'key-period', name: '.', type: 'control', direction: 'output', position: { x: 1, y: 0.69 } },
            { id: 'key-slash', name: '/', type: 'control', direction: 'output', position: { x: 1, y: 0.71 } },
            // Spacebar - y: 0.85
            { id: 'key-space', name: 'Space', type: 'control', direction: 'output', position: { x: 1, y: 0.85 } }
        ],
        defaultData: {},
        dimensions: { width: 660, height: 280 }
    },

    'instrument-visual': {
        type: 'instrument-visual',
        category: 'instruments',
        name: 'Instrument',
        description: 'Visual instrument with row configuration (internal node)',
        defaultPorts: [
            // Input ports on left (connected from input-panel rows)
            { id: 'row-in', name: 'Rows', type: 'control', direction: 'input', position: { x: 0, y: 0.5 } },
            // Audio output on right (connects to output-panel)
            { id: 'audio-out', name: 'Audio', type: 'audio', direction: 'output', position: { x: 1, y: 0.5 } }
        ],
        defaultData: {},
        dimensions: { width: 500, height: 300 },
        canEnter: false  // Cannot enter this internal visual node
    },

    microphone: {
        type: 'microphone',
        category: 'input',
        name: 'Microphone',
        description: 'Live audio input from microphone',
        defaultPorts: [{ ...audioOutput, position: { x: 1, y: 0.5 } }],
        defaultData: {
            isMuted: false,
            isActive: true
        },
        dimensions: { width: 140, height: 100 },
        canEnter: false  // Atomic node - no internal structure
    },

    midi: {
        type: 'midi',
        category: 'input',
        name: 'Midi',
        description: 'Connect MIDI controllers (keyboards, pads, knobs)',
        defaultPorts: [
            // Bundle outputs (expanded to per-control inside)
            { id: 'keys', name: 'Keys', type: 'control', direction: 'output' },
            { id: 'pads', name: 'Pads', type: 'control', direction: 'output' },
            { id: 'knobs', name: 'Knobs', type: 'control', direction: 'output' },
            { id: 'faders', name: 'Faders', type: 'control', direction: 'output' },
            { id: 'pitch-bend', name: 'Pitch', type: 'control', direction: 'output' },
            { id: 'mod-wheel', name: 'Mod', type: 'control', direction: 'output' },
        ],
        defaultData: {
            deviceId: null,
            presetId: 'generic',
            isConnected: false,
            activeChannel: 0, // 0 = omni (all channels)
            midiLearnMode: false,
            learnTarget: null,
            learnedMappings: {}
        },
        dimensions: { width: 160, height: 200 },
        canEnter: true,  // Press E to see per-control visual
        portLayout: {
            direction: 'vertical',
            outputArea: { x: 1, startY: 0.2, endY: 0.75 }
        }
    },

    'midi-visual': {
        type: 'midi-visual',
        category: 'input',
        name: 'MIDI Device',
        description: 'Visual MIDI device representation (internal node)',
        defaultPorts: [], // Ports generated dynamically from preset
        defaultData: {},
        dimensions: { width: 400, height: 250 },
        canEnter: false  // Cannot enter this internal visual node
    },

    'minilab-3': {
        type: 'minilab-3',
        category: 'input',
        name: 'MiniLab 3',
        description: 'Arturia MiniLab 3 - 25 keys, 8 pads, 8 knobs, 4 faders',
        defaultPorts: [
            // 25 Keys (C3-C5, notes 48-72) - all output control signals (velocity 0-1)
            { id: 'key-48', name: 'C3', type: 'control', direction: 'output' },
            { id: 'key-49', name: 'C#3', type: 'control', direction: 'output' },
            { id: 'key-50', name: 'D3', type: 'control', direction: 'output' },
            { id: 'key-51', name: 'D#3', type: 'control', direction: 'output' },
            { id: 'key-52', name: 'E3', type: 'control', direction: 'output' },
            { id: 'key-53', name: 'F3', type: 'control', direction: 'output' },
            { id: 'key-54', name: 'F#3', type: 'control', direction: 'output' },
            { id: 'key-55', name: 'G3', type: 'control', direction: 'output' },
            { id: 'key-56', name: 'G#3', type: 'control', direction: 'output' },
            { id: 'key-57', name: 'A3', type: 'control', direction: 'output' },
            { id: 'key-58', name: 'A#3', type: 'control', direction: 'output' },
            { id: 'key-59', name: 'B3', type: 'control', direction: 'output' },
            { id: 'key-60', name: 'C4', type: 'control', direction: 'output' },
            { id: 'key-61', name: 'C#4', type: 'control', direction: 'output' },
            { id: 'key-62', name: 'D4', type: 'control', direction: 'output' },
            { id: 'key-63', name: 'D#4', type: 'control', direction: 'output' },
            { id: 'key-64', name: 'E4', type: 'control', direction: 'output' },
            { id: 'key-65', name: 'F4', type: 'control', direction: 'output' },
            { id: 'key-66', name: 'F#4', type: 'control', direction: 'output' },
            { id: 'key-67', name: 'G4', type: 'control', direction: 'output' },
            { id: 'key-68', name: 'G#4', type: 'control', direction: 'output' },
            { id: 'key-69', name: 'A4', type: 'control', direction: 'output' },
            { id: 'key-70', name: 'A#4', type: 'control', direction: 'output' },
            { id: 'key-71', name: 'B4', type: 'control', direction: 'output' },
            { id: 'key-72', name: 'C5', type: 'control', direction: 'output' },
            // 8 Pads - velocity sensitive (0-1)
            { id: 'pad-1', name: 'Pad 1', type: 'control', direction: 'output' },
            { id: 'pad-2', name: 'Pad 2', type: 'control', direction: 'output' },
            { id: 'pad-3', name: 'Pad 3', type: 'control', direction: 'output' },
            { id: 'pad-4', name: 'Pad 4', type: 'control', direction: 'output' },
            { id: 'pad-5', name: 'Pad 5', type: 'control', direction: 'output' },
            { id: 'pad-6', name: 'Pad 6', type: 'control', direction: 'output' },
            { id: 'pad-7', name: 'Pad 7', type: 'control', direction: 'output' },
            { id: 'pad-8', name: 'Pad 8', type: 'control', direction: 'output' },
            // 8 Knobs - continuous (0-1)
            { id: 'knob-1', name: 'Knob 1', type: 'control', direction: 'output' },
            { id: 'knob-2', name: 'Knob 2', type: 'control', direction: 'output' },
            { id: 'knob-3', name: 'Knob 3', type: 'control', direction: 'output' },
            { id: 'knob-4', name: 'Knob 4', type: 'control', direction: 'output' },
            { id: 'knob-5', name: 'Knob 5', type: 'control', direction: 'output' },
            { id: 'knob-6', name: 'Knob 6', type: 'control', direction: 'output' },
            { id: 'knob-7', name: 'Knob 7', type: 'control', direction: 'output' },
            { id: 'knob-8', name: 'Knob 8', type: 'control', direction: 'output' },
            // 4 Faders - continuous (0-1, 0 = bottom, 1 = top)
            { id: 'fader-1', name: 'Fader 1', type: 'control', direction: 'output' },
            { id: 'fader-2', name: 'Fader 2', type: 'control', direction: 'output' },
            { id: 'fader-3', name: 'Fader 3', type: 'control', direction: 'output' },
            { id: 'fader-4', name: 'Fader 4', type: 'control', direction: 'output' },
            // Touch strips
            { id: 'pitch-bend', name: 'Pitch', type: 'control', direction: 'output' },
            { id: 'mod-wheel', name: 'Mod', type: 'control', direction: 'output' },
        ],
        defaultData: {
            deviceId: null,
            presetId: 'arturia-minilab-3',
            isConnected: false,
        },
        dimensions: { width: 650, height: 400 },
        canEnter: false  // Visual node - all controls are directly on the surface
    },

    // Instruments - all share similar layout: inputs on left, audio out on right
    piano: {
        type: 'piano',
        category: 'instruments',
        name: 'Classic Piano',
        description: 'Grand piano instrument',
        defaultPorts: [], // Ports generated from internal canvas-input/output nodes
        defaultData: {
            offsets: { 'input-1': 0 },
            activeInputs: ['input-1']
        },
        dimensions: { width: 180, height: 100 },
        portLayout: {
            direction: 'vertical',
            inputArea: { x: 0, startY: 0.2, endY: 0.8 },
            outputArea: { x: 1, startY: 0.4, endY: 0.6 }  // Audio out centered
        }
    },

    cello: {
        type: 'cello',
        category: 'instruments',
        name: 'Cello',
        description: 'Orchestral cello',
        defaultPorts: [], // Ports generated from internal canvas-input/output nodes
        defaultData: {
            offsets: { 'input-1': -12 }, // Default octaves lower
            activeInputs: ['input-1']
        },
        dimensions: { width: 180, height: 100 },
        portLayout: {
            direction: 'vertical',
            inputArea: { x: 0, startY: 0.2, endY: 0.8 },
            outputArea: { x: 1, startY: 0.4, endY: 0.6 }
        }
    },

    electricCello: {
        type: 'electricCello',
        category: 'instruments',
        name: 'Electric Cello',
        description: 'Modern electric cello with saturation and chorus',
        defaultPorts: [], // Ports generated from internal canvas-input/output nodes
        defaultData: {
            offsets: { 'input-1': -12 }, // Same range as acoustic cello
            activeInputs: ['input-1']
        },
        dimensions: { width: 180, height: 100 },
        portLayout: {
            direction: 'vertical',
            inputArea: { x: 0, startY: 0.2, endY: 0.8 },
            outputArea: { x: 1, startY: 0.4, endY: 0.6 }
        }
    },

    violin: {
        type: 'violin',
        category: 'instruments',
        name: 'Violin',
        description: 'Orchestral violin',
        defaultPorts: [], // Ports generated from internal canvas-input/output nodes
        defaultData: {
            offsets: { 'input-1': 12 }, // Higher pitch
            activeInputs: ['input-1']
        },
        dimensions: { width: 180, height: 100 },
        portLayout: {
            direction: 'vertical',
            inputArea: { x: 0, startY: 0.2, endY: 0.8 },
            outputArea: { x: 1, startY: 0.4, endY: 0.6 }
        }
    },

    saxophone: {
        type: 'saxophone',
        category: 'instruments',
        name: 'Saxophone',
        description: 'Jazz saxophone',
        defaultPorts: [], // Ports generated from internal canvas-input/output nodes
        defaultData: {
            offsets: { 'input-1': 0 },
            activeInputs: ['input-1']
        },
        dimensions: { width: 180, height: 100 },
        portLayout: {
            direction: 'vertical',
            inputArea: { x: 0, startY: 0.2, endY: 0.8 },
            outputArea: { x: 1, startY: 0.4, endY: 0.6 }
        }
    },

    // Category Aliases / Defaults - inherit layout from their base type
    strings: {
        type: 'strings', // Category alias for string instruments (defaults to cello sampler)
        category: 'instruments',
        name: 'Strings',
        description: 'String Ensemble',
        defaultPorts: [
            { id: 'bundle-in', name: 'Bundle', type: 'control', direction: 'input', isBundled: true },
            { id: 'pedal', name: 'Pedal', type: 'control', direction: 'input' },
            { id: 'audio-out', name: 'Output', type: 'audio', direction: 'output' }
        ],
        defaultData: {
            offsets: { 'input-1': -12 },
            activeInputs: ['input-1']
        },
        dimensions: { width: 180, height: 100 },
        portLayout: {
            direction: 'vertical',
            inputArea: { x: 0, startY: 0.2, endY: 0.8 },
            outputArea: { x: 1, startY: 0.4, endY: 0.6 }
        }
    },
    keys: {
        type: 'keys', // Category alias for keyboard instruments (defaults to piano sampler)
        category: 'instruments',
        name: 'Keys',
        description: 'Keyboards',
        defaultPorts: [
            { id: 'bundle-in', name: 'Bundle', type: 'control', direction: 'input', isBundled: true },
            { id: 'pedal', name: 'Pedal', type: 'control', direction: 'input' },
            { id: 'audio-out', name: 'Output', type: 'audio', direction: 'output' }
        ],
        defaultData: {
            offsets: { 'input-1': 0 },
            activeInputs: ['input-1']
        },
        dimensions: { width: 180, height: 100 },
        portLayout: {
            direction: 'vertical',
            inputArea: { x: 0, startY: 0.2, endY: 0.8 },
            outputArea: { x: 1, startY: 0.4, endY: 0.6 }
        }
    },
    winds: {
        type: 'winds', // Category alias for wind instruments (defaults to saxophone sampler)
        category: 'instruments',
        name: 'Winds',
        description: 'Wind Instruments',
        defaultPorts: [
            { id: 'bundle-in', name: 'Bundle', type: 'control', direction: 'input', isBundled: true },
            { id: 'pedal', name: 'Pedal', type: 'control', direction: 'input' },
            { id: 'audio-out', name: 'Output', type: 'audio', direction: 'output' }
        ],
        defaultData: {
            offsets: { 'input-1': 0 },
            activeInputs: ['input-1']
        },
        dimensions: { width: 180, height: 100 },
        portLayout: {
            direction: 'vertical',
            inputArea: { x: 0, startY: 0.2, endY: 0.8 },
            outputArea: { x: 1, startY: 0.4, endY: 0.6 }
        }
    },

    // Generic instrument node (uses instrumentId in data)
    instrument: {
        type: 'instrument',
        category: 'instruments',
        name: 'Instrument',
        description: 'Generic sampled instrument',
        defaultPorts: [
            { id: 'bundle-in', name: 'Bundle', type: 'control', direction: 'input', isBundled: true },
            { id: 'pedal', name: 'Pedal', type: 'control', direction: 'input' },
            { id: 'audio-out', name: 'Output', type: 'audio', direction: 'output' }
        ],
        defaultData: {
            offsets: { 'input-1': 0 },
            activeInputs: ['input-1'],
            instrumentId: 'salamander-piano'
        },
        dimensions: { width: 180, height: 120 }
    },

    // Effects & Processing
    looper: {
        type: 'looper',
        category: 'routing',
        name: 'Looper',
        description: 'Record and loop audio with auto-detection',
        defaultPorts: [
            { ...audioInput, position: { x: 0, y: 0.5 } },
            { ...audioOutput, position: { x: 1, y: 0.5 } }
        ],
        defaultData: {
            duration: 10,
            isRecording: false,
            loops: [],
            currentTime: 0
        },
        dimensions: { width: 240, height: 120 }
    },

    effect: {
        type: 'effect',
        category: 'effects',
        name: 'Effect',
        description: 'Audio effect processor',
        defaultPorts: [
            { ...audioInput, position: { x: 0, y: 0.5 } },
            { ...audioOutput, position: { x: 1, y: 0.5 } }
        ],
        defaultData: {
            effectType: 'distortion',
            params: { amount: 0.5 }
        },
        dimensions: { width: 160, height: 100 }
    },

    amplifier: {
        type: 'amplifier',
        category: 'effects',
        name: 'Amplifier',
        description: 'Gain control for audio signals',
        defaultPorts: [
            { ...audioInput, position: { x: 0, y: 0.35 } },
            { ...audioOutput, position: { x: 1, y: 0.5 } },
            { ...controlInput, id: 'gain-in', name: 'Gain', position: { x: 0, y: 0.65 } }
        ],
        defaultData: {
            gain: 1
        },
        dimensions: { width: 140, height: 100 }
    },

    // Outputs
    speaker: {
        type: 'speaker',
        category: 'output',
        name: 'Speaker',
        description: 'Audio output to device speakers',
        defaultPorts: [
            { ...audioInput, position: { x: 0, y: 0.5 } }
        ],
        defaultData: {
            volume: 1,
            isMuted: false,
            deviceId: 'default'
        },
        dimensions: { width: 140, height: 160 },
        canEnter: false  // Atomic node - no internal structure
    },

    recorder: {
        type: 'recorder',
        category: 'output',
        name: 'Recorder',
        description: 'Record audio to WAV file',
        defaultPorts: [
            { ...audioInput, position: { x: 0, y: 0.5 } }
        ],
        defaultData: {
            isRecording: false,
            recordings: []
        },
        dimensions: { width: 160, height: 120 }
    },

    // Hierarchical Canvas I/O Nodes - small connector nodes
    'canvas-input': {
        type: 'canvas-input',
        category: 'routing',
        name: 'Input',
        description: 'Receives signal from parent canvas',
        defaultPorts: [
            { id: 'out', name: 'Out', type: 'control', direction: 'output', position: { x: 1, y: 0.5 } }
        ],
        defaultData: {
            portName: ''
        },
        dimensions: { width: 80, height: 40 }
    },

    'canvas-output': {
        type: 'canvas-output',
        category: 'routing',
        name: 'Output',
        description: 'Sends signal to parent canvas',
        defaultPorts: [
            { id: 'in', name: 'In', type: 'control', direction: 'input', position: { x: 0, y: 0.5 } }
        ],
        defaultData: {
            portName: ''
        },
        dimensions: { width: 80, height: 40 }
    },

    'output-panel': {
        type: 'output-panel',
        category: 'routing',
        name: 'Outputs',
        description: 'Multi-port output panel with editable labels',
        defaultPorts: [
            // Default 4 ports for keyboard (Row 1, Row 2, Row 3, Pedal)
            { id: 'port-1', name: 'Row 1 (Q-P)', type: 'control', direction: 'input', position: { x: 0, y: 0.15 } },
            { id: 'port-2', name: 'Row 2 (A-L)', type: 'control', direction: 'input', position: { x: 0, y: 0.38 } },
            { id: 'port-3', name: 'Row 3 (Z-/)', type: 'control', direction: 'input', position: { x: 0, y: 0.61 } },
            { id: 'port-4', name: 'Pedal', type: 'control', direction: 'input', position: { x: 0, y: 0.84 } }
        ],
        defaultData: {
            // Store port labels for editing
            portLabels: {
                'port-1': 'Row 1 (Q-P)',
                'port-2': 'Row 2 (A-L)',
                'port-3': 'Row 3 (Z-/)',
                'port-4': 'Pedal'
            }
        },
        dimensions: { width: 160, height: 200 }
    },

    'input-panel': {
        type: 'input-panel',
        category: 'routing',
        name: 'Inputs',
        description: 'Multi-port input panel with editable labels',
        defaultPorts: [],  // Empty by default
        defaultData: {
            portLabels: {}
        },
        dimensions: { width: 160, height: 80 }
    },

    // Utility Nodes
    container: {
        type: 'container',
        category: 'utility',
        name: 'Empty Node',
        description: 'Empty node for grouping and organizing other nodes',
        defaultPorts: [],  // Ports synced from internal canvas-input/output nodes
        defaultData: {
            displayName: 'Untitled'
        },
        dimensions: { width: 160, height: 100 },
        canEnter: true  // Can be entered to place nodes inside
    },

    add: {
        type: 'add',
        category: 'utility',
        name: 'Add',
        description: 'Add two signals together (audio mixing or number addition)',
        defaultPorts: [
            { id: 'in-1', name: 'In 1', type: 'universal', direction: 'input', position: { x: 0, y: 0.33 } },
            { id: 'in-2', name: 'In 2', type: 'universal', direction: 'input', position: { x: 0, y: 0.67 } },
            { id: 'out', name: 'Out', type: 'universal', direction: 'output', position: { x: 1, y: 0.5 } }
        ],
        defaultData: {
            resolvedType: null
        },
        dimensions: { width: 120, height: 80 },
        canEnter: false  // Cannot be entered - flashes red on E key
    },

    subtract: {
        type: 'subtract',
        category: 'utility',
        name: 'Subtract',
        description: 'Subtract second signal from first (audio phase cancellation or number subtraction)',
        defaultPorts: [
            { id: 'in-1', name: 'In 1', type: 'universal', direction: 'input', position: { x: 0, y: 0.33 } },
            { id: 'in-2', name: 'In 2', type: 'universal', direction: 'input', position: { x: 0, y: 0.67 } },
            { id: 'out', name: 'Out', type: 'universal', direction: 'output', position: { x: 1, y: 0.5 } }
        ],
        defaultData: {
            resolvedType: null
        },
        dimensions: { width: 120, height: 80 },
        canEnter: false  // Cannot be entered - flashes red on E key
    },

    // Sample Library Node
    library: {
        type: 'library',
        category: 'input',
        name: 'Sample Library',
        description: 'Local audio file library for samples, loops, and sound effects',
        defaultPorts: [
            { id: 'trigger', name: 'Trigger', type: 'control', direction: 'input', position: { x: 0, y: 0.3 } },
            { id: 'audio-out', name: 'Audio', type: 'audio', direction: 'output', position: { x: 1, y: 0.5 } }
        ],
        defaultData: {
            libraryId: undefined,
            currentSampleId: undefined,
            sampleRefs: [],
            playbackMode: 'oneshot',
            volume: 1,
            missingSampleIds: []
        },
        dimensions: { width: 280, height: 200 },
        canEnter: false  // Sample browser is inline, not a sub-canvas
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

export const menuCategories: MenuCategory[] = [
    {
        name: 'Input',
        icon: '⌨️',
        items: ['keyboard', 'midi', 'microphone', 'library']
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
        name: 'Utility',
        icon: '🔧',
        items: ['container', 'add', 'subtract']
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
    // ANY-TO-ANY PHILOSOPHY: Allow all connections by default
    // Signal coercion/interpretation happens at the receiving node
    // This follows modular synth conventions where "it's all just voltage"

    // FIRST: Enforce direction for ALL connection types
    // Can't connect output→output or input→input regardless of signal type
    if (sourcePort.direction === targetPort.direction) {
        return false;
    }

    // Universal ports can connect to anything (they adapt to the connected type)
    if (sourcePort.type === 'universal' || targetPort.type === 'universal') {
        return true;
    }

    // All other connections are allowed:
    // - audio → control (audio modulates a parameter)
    // - control → audio (control signal as audio, interesting effects)
    // - control → control (normal parameter routing)
    // - audio → audio (normal audio routing)
    return true;
}
