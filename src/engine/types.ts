/**
 * OpenJammer - Core Type Definitions
 * 
 * This file defines all the core types for the node graph system.
 * Connection types are color-coded and directional/bidirectional.
 */

// ============================================================================
// Connection Types
// ============================================================================

export type ConnectionType = 'audio' | 'technical';

export interface PortDefinition {
    id: string;
    name: string;
    type: ConnectionType;
    direction: 'input' | 'output';
}

export interface Connection {
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
    type: ConnectionType;
}

// ============================================================================
// Node Types
// ============================================================================

export type NodeCategory =
    | 'instruments'
    | 'input'
    | 'effects'
    | 'routing'
    | 'output';

export type NodeType =
    | 'keyboard'
    | 'microphone'
    | 'piano'
    | 'cello'
    | 'electricCello'
    | 'violin'
    | 'saxophone'
    | 'strings'
    | 'keys'
    | 'winds'
    | 'instrument' // Generic instrument node (uses instrumentId in data)
    | 'looper'
    | 'effect'
    | 'amplifier'
    | 'speaker'
    | 'recorder';

export interface Position {
    x: number;
    y: number;
}

export interface NodeData {
    // Common fields
    [key: string]: unknown;
}

export interface InstrumentNodeData extends NodeData {
    instrumentId?: string; // ID from InstrumentDefinitions (optional, falls back to legacy type mapping)
    offsets: { [portId: string]: number }; // Per-input pitch offset (semitones)
    octaveOffsets?: { [portId: string]: number }; // Per-input octave adjustment
    noteOffsets?: { [portId: string]: number }; // Per-input note adjustment (0-6 for C-B)
    activeInputs: string[]; // List of active input port IDs
    isLoading?: boolean; // For UI loading indicator
}

export interface KeyboardNodeData extends NodeData {
    assignedKey: number; // 2-9
    activeRow: number | null;
    rowOctaves: [number, number, number];
}

export interface MicrophoneNodeData extends NodeData {
    isMuted: boolean;
    isActive: boolean;
    deviceId?: string;
    lowLatencyMode?: boolean; // Override global setting per node
}

export interface LooperNodeData extends NodeData {
    duration: number; // in seconds, default 10
    isRecording: boolean;
    loops: LoopData[];
    currentTime: number;
}

export interface LoopData {
    id: string;
    buffer: ArrayBuffer | null;
    startTime: number;
    duration: number;
    isMuted: boolean;
    effects: string[]; // Effect node IDs applied to this loop
}

export interface EffectNodeData extends NodeData {
    effectType: 'distortion' | 'pitch' | 'reverb' | 'delay';
    params: Record<string, number>;
}

export interface AmplifierNodeData extends NodeData {
    gain: number; // Multiplier: 2 = double, -2 = half
}

export interface SpeakerNodeData extends NodeData {
    volume: number; // 0-1
    isMuted: boolean;
    deviceId: string; // ID of selected output device
    sinkIdApplied?: boolean; // Track if setSinkId succeeded
}

export interface RecorderNodeData extends NodeData {
    isRecording: boolean;
    recordings: RecordingData[];
}

export interface RecordingData {
    id: string;
    buffer: ArrayBuffer | null;
    duration: number;
    timestamp: number;
}

// ============================================================================
// Node Definition
// ============================================================================

export interface GraphNode {
    id: string;
    type: NodeType;
    category: NodeCategory;
    position: Position;
    data: NodeData;
    ports: PortDefinition[];
}

// ============================================================================
// Graph State
// ============================================================================

export interface GraphState {
    nodes: Map<string, GraphNode>;
    connections: Map<string, Connection>;
    selectedNodeIds: Set<string>;
    selectedConnectionIds: Set<string>;
}

// ============================================================================
// Canvas State
// ============================================================================

export interface CanvasState {
    pan: Position;
    zoom: number;
    isDragging: boolean;
    isPanning: boolean;
    dragStart: Position | null;
}

// ============================================================================
// Workflow Serialization
// ============================================================================

export interface SerializedWorkflow {
    version: string;
    name: string;
    createdAt: string;
    nodes: SerializedNode[];
    connections: SerializedConnection[];
}

export interface SerializedNode {
    id: string;
    type: NodeType;
    category: NodeCategory;
    position: Position;
    data: NodeData;
}

export interface SerializedConnection {
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
    type: ConnectionType;
}

// ============================================================================
// Node Registry
// ============================================================================

export interface NodeDefinition {
    type: NodeType;
    category: NodeCategory;
    name: string;
    description: string;
    defaultPorts: PortDefinition[];
    defaultData: NodeData;
}

// ============================================================================
// Audio Engine Types
// ============================================================================

export interface AudioNodeWrapper {
    nodeId: string;
    inputNode: AudioNode | null;
    outputNode: AudioNode | null;
    internalNodes: AudioNode[];
}
