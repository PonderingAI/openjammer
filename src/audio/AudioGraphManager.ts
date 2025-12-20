/**
 * AudioGraphManager - Bridge between visual node graph and Web Audio API
 *
 * Watches graphStore for connection changes and creates corresponding Web Audio connections.
 * Handles hot-swapping during playback with gain ramping to prevent clicks.
 */

import { getAudioContext } from './AudioEngine';
import { getNoteName, getLegacyInstrumentId } from './Instruments';
import type { SampledInstrument } from './Instruments';
import { InstrumentLoader } from './Instruments';
import { createEffect, Effect } from './Effects';
import { Looper } from './Looper';
import { Recorder } from './Recorder';
import type { GraphNode, Connection, NodeType, EffectNodeData, AmplifierNodeData, SpeakerNodeData, InstrumentNodeData, NodeData } from '../engine/types';

// Type guard for instrument node data
function isInstrumentNodeData(data: NodeData): data is InstrumentNodeData {
    if (typeof data !== 'object' || data === null) return false;
    if (!('offsets' in data)) return false;

    const offsets = (data as InstrumentNodeData).offsets;
    return typeof offsets === 'object' && offsets !== null;
}
import { useGraphStore } from '../store/graphStore';
import { TonePianoInstrument } from './samplers/TonePianoAdapter';

// ============================================================================
// Constants
// ============================================================================

/** Valid instrument node types for keyboard triggering */
const INSTRUMENT_NODE_TYPES = ['piano', 'cello', 'electricCello', 'violin', 'saxophone', 'strings', 'keys', 'winds'] as const;

/** Keyboard row bounds (1-indexed rows) */
const MIN_KEYBOARD_ROW = 1;
const MAX_KEYBOARD_ROW = 3;

/** Key index bounds (0-indexed within each row) */
const MIN_KEY_INDEX = 0;
const MAX_KEY_INDEX = 11; // 12 keys per row (chromatic octave)

// ============================================================================
// Types
// ============================================================================

export interface AudioNodeInstance {
    nodeId: string;
    type: NodeType;
    inputNode: AudioNode | null;
    outputNode: AudioNode | null;
    instance: SampledInstrument | Effect | Looper | Recorder | GainNode | MediaStreamAudioSourceNode |
        { audioElement: HTMLAudioElement; gainNode: GainNode; destination: MediaStreamAudioDestinationNode } |
        { input1: GainNode; input2: GainNode; outputMixer: GainNode } |  // Add node
        { input1: GainNode; input2: GainNode; inverter: GainNode; outputMixer: GainNode } |  // Subtract node
        null;
    gainEnvelope: GainNode | null; // For smooth connect/disconnect
}

type ConnectionChangeCallback = (connections: Map<string, Connection>) => void;
type NodeChangeCallback = (nodes: Map<string, GraphNode>) => void;

// ============================================================================
// AudioGraphManager
// ============================================================================

class AudioGraphManager {
    private audioNodes: Map<string, AudioNodeInstance> = new Map();
    private activeAudioConnections: Set<string> = new Set(); // Track "sourceId->targetId" pairs
    private pendingDisconnects: Map<string, number> = new Map(); // Track pending disconnect timeouts
    private connectionGenerations: Map<string, number> = new Map(); // Track connection versions for race condition prevention
    private isInitialized: boolean = false;
    private unsubscribeGraph: (() => void) | null = null;

    // Signal level visualization
    private connectionAnalysers: Map<string, AnalyserNode> = new Map(); // connectionKey -> AnalyserNode
    private signalLevels: Map<string, number> = new Map(); // connectionKey -> 0-1 RMS level
    private signalUpdateCallbacks: Set<(levels: Map<string, number>) => void> = new Set();
    private signalAnimationId: number | null = null;
    private lastSignalUpdateTime: number = 0;
    private readonly SIGNAL_UPDATE_INTERVAL_MS = 100; // Update every 100ms for performance

    // Ramp time for smooth transitions (10ms)
    private readonly RAMP_TIME = 0.01;

    /**
     * Safety buffer (ms) added to ramp time delays.
     * Ensures the gain ramp completes before disconnecting nodes.
     * Without this buffer, race conditions can cause audio clicks
     * if setTimeout fires slightly before the ramp finishes.
     */
    private readonly RAMP_SAFETY_BUFFER_MS = 10;

    /**
     * Initialize the manager and subscribe to graph changes
     */
    initialize(
        subscribeToConnections: (callback: ConnectionChangeCallback) => () => void,
        subscribeToNodes: (callback: NodeChangeCallback) => () => void,
        getNodes: () => Map<string, GraphNode>,
        getConnections: () => Map<string, Connection>
    ): void {
        if (this.isInitialized) return;

        // Subscribe to node changes
        const unsubNodes = subscribeToNodes((nodes) => {
            this.syncNodes(nodes);
        });

        // Subscribe to connection changes
        const unsubConns = subscribeToConnections((connections) => {
            this.syncConnections(connections, getNodes());
        });

        // Initial sync
        this.syncNodes(getNodes());
        this.syncConnections(getConnections(), getNodes());

        this.unsubscribeGraph = () => {
            unsubNodes();
            unsubConns();
        };

        this.isInitialized = true;
    }

    /**
     * Cleanup and disconnect all audio nodes
     */
    dispose(): void {
        // Stop signal visualization
        this.stopSignalUpdateLoop();
        this.signalUpdateCallbacks.clear();

        // Clear pending disconnect timeouts
        this.pendingDisconnects.forEach((timeoutId) => {
            clearTimeout(timeoutId);
        });
        this.pendingDisconnects.clear();

        // Clean up connection analysers
        this.connectionAnalysers.forEach((analyser) => {
            try {
                analyser.disconnect();
            } catch {
                // May already be disconnected
            }
        });
        this.connectionAnalysers.clear();
        this.signalLevels.clear();

        this.audioNodes.forEach((nodeInstance) => {
            this.destroyAudioNode(nodeInstance);
        });
        this.audioNodes.clear();
        this.activeAudioConnections.clear();

        if (this.unsubscribeGraph) {
            this.unsubscribeGraph();
            this.unsubscribeGraph = null;
        }

        this.isInitialized = false;
    }

    // ============================================================================
    // Signal Level Visualization
    // ============================================================================

    /**
     * Subscribe to signal level updates
     * @returns Unsubscribe function
     */
    subscribeToSignalLevels(callback: (levels: Map<string, number>) => void): () => void {
        this.signalUpdateCallbacks.add(callback);

        // Start the animation loop if this is the first subscriber
        if (this.signalUpdateCallbacks.size === 1) {
            this.startSignalUpdateLoop();
        }

        // Immediately call with current levels
        callback(this.signalLevels);

        return () => {
            this.signalUpdateCallbacks.delete(callback);

            // Stop the animation loop if no more subscribers
            if (this.signalUpdateCallbacks.size === 0) {
                this.stopSignalUpdateLoop();
            }
        };
    }

    /**
     * Get current signal level for a connection
     * @param connectionKey - Format: "sourceNodeId->targetNodeId"
     * @returns Signal level 0-1, or 0 if not found
     */
    getSignalLevel(connectionKey: string): number {
        return this.signalLevels.get(connectionKey) ?? 0;
    }

    /**
     * Get all current signal levels
     */
    getAllSignalLevels(): Map<string, number> {
        return new Map(this.signalLevels);
    }

    /**
     * Start the signal level update animation loop
     */
    private startSignalUpdateLoop(): void {
        if (this.signalAnimationId !== null) return;

        const updateLoop = (timestamp: number) => {
            // Throttle updates to SIGNAL_UPDATE_INTERVAL_MS
            if (timestamp - this.lastSignalUpdateTime >= this.SIGNAL_UPDATE_INTERVAL_MS) {
                this.updateSignalLevels();
                this.lastSignalUpdateTime = timestamp;
            }

            this.signalAnimationId = requestAnimationFrame(updateLoop);
        };

        this.signalAnimationId = requestAnimationFrame(updateLoop);
    }

    /**
     * Stop the signal level update animation loop
     */
    private stopSignalUpdateLoop(): void {
        if (this.signalAnimationId !== null) {
            cancelAnimationFrame(this.signalAnimationId);
            this.signalAnimationId = null;
        }
    }

    /**
     * Update all signal levels from analysers
     */
    private updateSignalLevels(): void {
        let hasChanges = false;

        this.connectionAnalysers.forEach((analyser, connectionKey) => {
            // Get time domain data for RMS calculation
            const dataArray = new Float32Array(analyser.fftSize);
            analyser.getFloatTimeDomainData(dataArray);

            // Calculate RMS (root mean square) for signal level
            let sumSquares = 0;
            for (let i = 0; i < dataArray.length; i++) {
                sumSquares += dataArray[i] * dataArray[i];
            }
            const rms = Math.sqrt(sumSquares / dataArray.length);

            // Normalize to 0-1 range (typical audio RMS is 0-0.5 for loud signals)
            // Multiply by 3 and clamp to make visualization more visible
            const normalizedLevel = Math.min(1, rms * 3);

            // Apply smoothing (exponential moving average)
            const previousLevel = this.signalLevels.get(connectionKey) ?? 0;
            const smoothedLevel = previousLevel * 0.7 + normalizedLevel * 0.3;

            if (Math.abs(smoothedLevel - previousLevel) > 0.01) {
                this.signalLevels.set(connectionKey, smoothedLevel);
                hasChanges = true;
            }
        });

        // Notify subscribers if there are changes
        if (hasChanges) {
            this.signalUpdateCallbacks.forEach(callback => {
                callback(this.signalLevels);
            });
        }
    }

    /**
     * Create an analyser for a connection
     */
    private createConnectionAnalyser(connectionKey: string, sourceNode: AudioNode): AnalyserNode | null {
        const ctx = getAudioContext();
        if (!ctx) return null;

        // Create analyser with small FFT for performance
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256; // Small for fast processing
        analyser.smoothingTimeConstant = 0.5;

        // Connect source to analyser (analyser is a pass-through)
        try {
            sourceNode.connect(analyser);
        } catch {
            // May fail if source is already connected elsewhere
            return null;
        }

        this.connectionAnalysers.set(connectionKey, analyser);
        this.signalLevels.set(connectionKey, 0);

        return analyser;
    }

    /**
     * Remove an analyser for a connection
     */
    private removeConnectionAnalyser(connectionKey: string): void {
        const analyser = this.connectionAnalysers.get(connectionKey);
        if (analyser) {
            try {
                analyser.disconnect();
            } catch {
                // May already be disconnected
            }
            this.connectionAnalysers.delete(connectionKey);
            this.signalLevels.delete(connectionKey);
        }
    }

    /**
     * Get audio node instance by node ID
     */
    getAudioNode(nodeId: string): AudioNodeInstance | undefined {
        return this.audioNodes.get(nodeId);
    }

    /**
     * Get all audio node instances
     */
    getAllAudioNodes(): Map<string, AudioNodeInstance> {
        return new Map(this.audioNodes);
    }

    // ============================================================================
    // Node Sync
    // ============================================================================

    /**
     * Sync audio nodes with graph nodes
     */
    private syncNodes(graphNodes: Map<string, GraphNode>): void {
        // Remove audio nodes that no longer exist in graph
        this.audioNodes.forEach((audioNode, nodeId) => {
            // Check if this is an internal node (has :: separator)
            if (nodeId.includes('::')) {
                // Internal node reference (legacy format parentId::internalId)
                const [, internalId] = nodeId.split('::');
                // With flat structure, internal nodes are in the main map
                if (!graphNodes.has(internalId)) {
                    this.destroyAudioNode(audioNode);
                    this.audioNodes.delete(nodeId);
                }
            } else {
                // Any node - check if it exists in the flat graph
                if (!graphNodes.has(nodeId)) {
                    this.destroyAudioNode(audioNode);
                    this.audioNodes.delete(nodeId);
                }
            }
        });

        // Create audio nodes for new graph nodes (root nodes only)
        // Internal nodes are created on-demand by getInternalAudioNode()
        graphNodes.forEach((graphNode, nodeId) => {
            if (!this.audioNodes.has(nodeId)) {
                const audioNode = this.createAudioNode(graphNode);
                if (audioNode) {
                    this.audioNodes.set(nodeId, audioNode);
                }
            }
        });
    }

    /**
     * Create an audio node instance for a graph node
     */
    private createAudioNode(graphNode: GraphNode): AudioNodeInstance | null {
        const ctx = getAudioContext();
        if (!ctx) return null;

        const baseInstance: AudioNodeInstance = {
            nodeId: graphNode.id,
            type: graphNode.type,
            inputNode: null,
            outputNode: null,
            instance: null,
            gainEnvelope: null
        };

        // Create gain envelope for smooth transitions
        const gainEnvelope = ctx.createGain();
        gainEnvelope.gain.value = 1;
        baseInstance.gainEnvelope = gainEnvelope;

        switch (graphNode.type) {
            // Instruments - output only
            case 'piano':
            case 'cello':
            case 'electricCello':
            case 'violin':
            case 'saxophone':
            case 'strings':
            case 'keys':
            case 'winds': {
                const instrumentId = this.getInstrumentIdForNode(graphNode);
                const instrument = InstrumentLoader.create(instrumentId);

                // Set loading state callback for UI updates
                instrument.setOnLoadingStateChange((state) => {
                    console.debug(`Instrument ${instrumentId} loading state: ${state}`);
                    // TODO: Could emit event or update store for UI here
                });

                const output = instrument.getOutput();
                if (output) {
                    output.disconnect(); // Disconnect from master
                    output.connect(gainEnvelope);
                }
                baseInstance.instance = instrument;
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Microphone - output only
            case 'microphone': {
                // Microphone creates its own source node when activated
                // We just set up the output routing
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Keyboard - no audio, just control signals
            case 'keyboard': {
                // Keyboards don't process audio, they send control signals
                return null;
            }

            // Looper - input and output
            case 'looper': {
                const looper = new Looper(graphNode.data.duration as number || 10);
                const looperOutput = looper.getOutput();
                if (looperOutput) {
                    looperOutput.disconnect(); // Disconnect from master
                    looperOutput.connect(gainEnvelope);
                }

                // Get input node from looper (creates analyser + MediaStreamDestination)
                const looperInput = looper.getInputNode();

                baseInstance.instance = looper;
                baseInstance.inputNode = looperInput;
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Effects - input and output
            case 'effect': {
                const effectData = graphNode.data as EffectNodeData;
                const effect = createEffect(effectData.effectType, effectData.params);
                const effectInput = effect.getInput();
                const effectOutput = effect.getOutput();

                if (effectOutput) {
                    effectOutput.connect(gainEnvelope);
                }

                baseInstance.instance = effect;
                baseInstance.inputNode = effectInput;
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Amplifier - input and output
            case 'amplifier': {
                const ampData = graphNode.data as AmplifierNodeData;
                const ampGain = ctx.createGain();
                ampGain.gain.value = ampData.gain ?? 1;
                ampGain.connect(gainEnvelope);

                baseInstance.instance = ampGain;
                baseInstance.inputNode = ampGain;
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Speaker - input only, connects to destination
            case 'speaker': {
                const speakerData = graphNode.data as SpeakerNodeData;
                const speakerGain = ctx.createGain();
                speakerGain.gain.value = speakerData.isMuted ? 0 : (speakerData.volume ?? 1);

                // Create MediaStreamDestination for device routing
                const destination = ctx.createMediaStreamDestination();
                speakerGain.connect(destination);

                // Create hidden audio element for setSinkId
                const audioElement = new Audio();
                audioElement.srcObject = destination.stream;
                audioElement.play().catch(e => {
                    console.warn('Failed to start audio element:', e);
                });

                // Apply device selection if supported
                if (this.supportsSetSinkId() && speakerData.deviceId !== 'default') {
                    (audioElement as any).setSinkId(speakerData.deviceId)
                        .catch((err: Error) => {
                            console.error('Failed to set output device:', err);
                        });
                }

                // Store audio element for later device switching
                baseInstance.instance = {
                    gainNode: speakerGain,
                    audioElement: audioElement,
                    destination: destination
                };
                baseInstance.inputNode = speakerGain;
                baseInstance.outputNode = speakerGain; // Also output for chaining to recorder
                break;
            }

            // Recorder - input only
            case 'recorder': {
                const recorder = new Recorder();
                const recorderInput = recorder.getInput();

                baseInstance.instance = recorder;
                baseInstance.inputNode = recorderInput;
                break;
            }

            // Addition Node - mixes two inputs together
            case 'add': {
                const input1 = ctx.createGain();
                const input2 = ctx.createGain();
                const outputMixer = ctx.createGain();

                input1.gain.value = 1;
                input2.gain.value = 1;
                outputMixer.gain.value = 1;

                // Connect both inputs to output mixer
                input1.connect(outputMixer);
                input2.connect(outputMixer);
                outputMixer.connect(gainEnvelope);

                baseInstance.instance = { input1, input2, outputMixer } as { input1: GainNode; input2: GainNode; outputMixer: GainNode };
                baseInstance.inputNode = input1;  // Primary input
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Subtraction Node - inverts second input and mixes (phase cancellation)
            case 'subtract': {
                const input1 = ctx.createGain();
                const input2 = ctx.createGain();
                const inverter = ctx.createGain();
                const outputMixer = ctx.createGain();

                input1.gain.value = 1;
                input2.gain.value = 1;
                inverter.gain.value = -1;  // Phase inversion
                outputMixer.gain.value = 1;

                // Input 1 goes directly to output
                input1.connect(outputMixer);
                // Input 2 goes through inverter then to output
                input2.connect(inverter);
                inverter.connect(outputMixer);
                outputMixer.connect(gainEnvelope);

                baseInstance.instance = { input1, input2, inverter, outputMixer } as { input1: GainNode; input2: GainNode; inverter: GainNode; outputMixer: GainNode };
                baseInstance.inputNode = input1;  // Primary input
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            // Container Node - passthrough, audio flows through internal nodes
            case 'container': {
                const passthrough = ctx.createGain();
                passthrough.gain.value = 1;
                passthrough.connect(gainEnvelope);

                baseInstance.instance = passthrough;
                baseInstance.inputNode = passthrough;
                baseInstance.outputNode = gainEnvelope;
                break;
            }

            default:
                return null;
        }

        return baseInstance;
    }

    /**
     * Destroy an audio node instance
     */
    private destroyAudioNode(audioNode: AudioNodeInstance): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        // Fade out before disconnecting
        if (audioNode.gainEnvelope) {
            const now = ctx.currentTime;
            audioNode.gainEnvelope.gain.setValueAtTime(
                audioNode.gainEnvelope.gain.value,
                now
            );
            audioNode.gainEnvelope.gain.linearRampToValueAtTime(0, now + this.RAMP_TIME);

            // Disconnect after fade (with safety buffer to ensure ramp completes)
            setTimeout(() => {
                audioNode.gainEnvelope?.disconnect();
            }, this.RAMP_TIME * 1000 + this.RAMP_SAFETY_BUFFER_MS);
        }

        // Cleanup specific instance types
        if (audioNode.instance && 'disconnect' in audioNode.instance && typeof audioNode.instance.disconnect === 'function') {
            audioNode.instance.disconnect();
        }

        // Cleanup speaker audio element
        if (audioNode.instance && typeof audioNode.instance === 'object' && 'audioElement' in audioNode.instance) {
            const speakerInstance = audioNode.instance as {
                audioElement: HTMLAudioElement;
                destination: MediaStreamAudioDestinationNode;
                gainNode: GainNode;
            };
            speakerInstance.audioElement.pause();
            speakerInstance.audioElement.srcObject = null;
            speakerInstance.gainNode.disconnect();
            speakerInstance.destination.disconnect();
        }

        // Disconnect nodes (may throw if already disconnected)
        try {
            audioNode.inputNode?.disconnect();
        } catch {
            // Already disconnected - safe to ignore
        }
        try {
            audioNode.outputNode?.disconnect();
        } catch {
            // Already disconnected - safe to ignore
        }
    }

    /**
     * Get instrument ID for a node, supporting both new instrumentId field and legacy type mapping
     */
    private getInstrumentIdForNode(node: GraphNode): string {
        // Check if node has explicit instrumentId in data
        const nodeData = node.data as InstrumentNodeData;
        if (nodeData.instrumentId) {
            return nodeData.instrumentId;
        }
        // Fall back to legacy type mapping
        return getLegacyInstrumentId(node.type);
    }

    // ============================================================================
    // Connection Sync
    // ============================================================================

    /**
     * Sync audio connections with graph connections
     */
    private syncConnections(
        graphConnections: Map<string, Connection>,
        _graphNodes: Map<string, GraphNode>
    ): void {
        // Only handle audio connections, not control/control connections
        const audioConnections = Array.from(graphConnections.values())
            .filter(conn => conn.type === 'audio');

        // Build set of current connection keys
        const currentConnectionKeys = new Set<string>();
        audioConnections.forEach(connection => {
            const key = `${connection.sourceNodeId}->${connection.targetNodeId}`;
            currentConnectionKeys.add(key);
        });

        // Find and disconnect removed connections
        this.activeAudioConnections.forEach(key => {
            if (!currentConnectionKeys.has(key)) {
                const [sourceNodeId, targetNodeId] = key.split('->');
                this.disconnectAudioNodes(sourceNodeId, targetNodeId);
            }
        });

        // Connect new audio connections
        audioConnections.forEach(connection => {
            const key = `${connection.sourceNodeId}->${connection.targetNodeId}`;
            if (!this.activeAudioConnections.has(key)) {
                this.connectAudioNodes(
                    connection.sourceNodeId,
                    connection.targetNodeId
                );
            }
        });

        // Update tracked connections
        this.activeAudioConnections = currentConnectionKeys;

        // Process hierarchical routing through internal structures
        this.processHierarchicalRouting(_graphNodes);
    }

    /**
     * Process hierarchical audio routing through internal structures
     * This enables audio to flow: Root → Internal Level 1 → Internal Level 2 → etc.
     * With flat structure, we find parent nodes by checking childIds
     */
    private processHierarchicalRouting(graphNodes: Map<string, GraphNode>): void {
        const graphConnections = useGraphStore.getState().connections;

        // For each node that has children (is a container)
        graphNodes.forEach((node) => {
            if (!node.childIds || node.childIds.length === 0) return;

            // Get connections between this node's children
            const childIdsSet = new Set(node.childIds);
            const internalAudioConnections = Array.from(graphConnections.values()).filter(
                conn => conn.type === 'audio' &&
                    childIdsSet.has(conn.sourceNodeId) &&
                    childIdsSet.has(conn.targetNodeId)
            );

            internalAudioConnections.forEach(conn => {
                // Get internal audio nodes (now directly from flat structure)
                const sourceInternal = this.getInternalAudioNode(node.id, conn.sourceNodeId);
                const targetInternal = this.getInternalAudioNode(node.id, conn.targetNodeId);

                if (sourceInternal?.outputNode && targetInternal?.inputNode) {
                    try {
                        sourceInternal.outputNode.connect(targetInternal.inputNode);
                    } catch {
                        // Connection may already exist
                    }
                }
            });

            // Route audio FROM parent input ports INTO internal canvas-input nodes
            this.routeParentInputsToInternal(node, graphNodes);

            // Route audio FROM internal canvas-output nodes TO parent output ports
            this.routeInternalToParentOutputs(node, graphNodes);
        });
    }

    /**
     * Get or create audio node for an internal node
     * With flat structure, internal nodes are in the main nodes Map
     */
    private getInternalAudioNode(parentId: string, internalNodeId: string): AudioNodeInstance | null {
        const ctx = getAudioContext();
        if (!ctx) return null;

        // Check if we've already created an audio instance for this internal node
        const fullNodeId = `${parentId}::${internalNodeId}`;
        let audioNode = this.audioNodes.get(fullNodeId);

        if (!audioNode) {
            // Get internal node from flat structure
            const graphNodes = useGraphStore.getState().nodes;
            const internalNode = graphNodes.get(internalNodeId);

            // Verify it's actually a child of the parent
            if (!internalNode || internalNode.parentId !== parentId) return null;

            // Create audio node for internal node
            const createdNode = this.createAudioNode(internalNode);
            if (createdNode) {
                // Override ID to include parent context
                createdNode.nodeId = fullNodeId;
                this.audioNodes.set(fullNodeId, createdNode);
                audioNode = createdNode;
            }
        }

        return audioNode ?? null;
    }

    /**
     * Route audio from parent node's input connections into internal canvas-input nodes
     * With flat structure, we look up child nodes from the main map
     */
    private routeParentInputsToInternal(parentNode: GraphNode, graphNodes: Map<string, GraphNode>): void {
        if (!parentNode.childIds || parentNode.childIds.length === 0) return;

        const parentAudioNode = this.audioNodes.get(parentNode.id);
        if (!parentAudioNode?.inputNode) return;

        // Find all canvas-input nodes inside parent
        parentNode.childIds.forEach((childId: string) => {
            const internalNode = graphNodes.get(childId);
            if (!internalNode || internalNode.type !== 'canvas-input') return;

            // Check if this canvas-input corresponds to a parent input port
            const parentInputPort = parentNode.ports.find(
                p => p.id === childId && p.direction === 'input'
            );

            if (!parentInputPort) return;

            // Get or create audio node for internal canvas-input
            const internalAudioNode = this.getInternalAudioNode(parentNode.id, childId);
            if (!internalAudioNode?.outputNode) return;

            // Route: External connections → Parent input → Internal canvas-input output
            // The parent's inputNode already receives from external connections
            // We need to route that to the internal canvas-input's outputNode
            if (parentAudioNode.inputNode && internalAudioNode.outputNode) {
                try {
                    parentAudioNode.inputNode.connect(internalAudioNode.outputNode);
                } catch {
                    // May already be connected
                }
            }
        });
    }

    /**
     * Route audio from internal canvas-output nodes to parent node's output
     * With flat structure, we look up child nodes from the main map
     */
    private routeInternalToParentOutputs(parentNode: GraphNode, graphNodes: Map<string, GraphNode>): void {
        if (!parentNode.childIds || parentNode.childIds.length === 0) return;

        const parentAudioNode = this.audioNodes.get(parentNode.id);
        if (!parentAudioNode?.outputNode) return;

        // Find all canvas-output nodes inside parent
        parentNode.childIds.forEach((childId: string) => {
            const internalNode = graphNodes.get(childId);
            if (!internalNode || internalNode.type !== 'canvas-output') return;

            // Check if this canvas-output corresponds to a parent output port
            const parentOutputPort = parentNode.ports.find(
                p => p.id === childId && p.direction === 'output'
            );

            if (!parentOutputPort) return;

            // Get or create audio node for internal canvas-output
            const internalAudioNode = this.getInternalAudioNode(parentNode.id, childId);
            if (!internalAudioNode?.inputNode) return;

            // Route: Internal canvas-output input → Parent output
            // The internal canvas-output's inputNode receives from internal connections
            // We need to route that to the parent's outputNode
            if (internalAudioNode.inputNode && parentAudioNode.outputNode) {
                try {
                    internalAudioNode.inputNode.connect(parentAudioNode.outputNode);
                } catch {
                    // May already be connected
                }
            }
        });
    }

    /**
     * Connect two audio nodes
     */
    private connectAudioNodes(sourceNodeId: string, targetNodeId: string): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        const connectionKey = `${sourceNodeId}->${targetNodeId}`;

        // Prevent duplicate connections
        if (this.activeAudioConnections.has(connectionKey)) {
            return;
        }

        // Increment connection generation to invalidate any pending disconnects
        // This prevents race conditions where a disconnect timeout fires after reconnection
        const newGeneration = (this.connectionGenerations.get(connectionKey) || 0) + 1;
        this.connectionGenerations.set(connectionKey, newGeneration);

        // Cancel any pending disconnect for this connection
        const pendingTimeout = this.pendingDisconnects.get(connectionKey);
        if (pendingTimeout !== undefined) {
            clearTimeout(pendingTimeout);
            this.pendingDisconnects.delete(connectionKey);
        }

        const sourceAudioNode = this.audioNodes.get(sourceNodeId);
        const targetAudioNode = this.audioNodes.get(targetNodeId);

        if (!sourceAudioNode?.outputNode || !targetAudioNode?.inputNode) {
            return;
        }

        // Web Audio allows multiple connections, track to prevent duplicates
        try {
            // Fade in the connection smoothly
            if (sourceAudioNode.gainEnvelope) {
                const now = ctx.currentTime;
                sourceAudioNode.gainEnvelope.gain.setValueAtTime(0, now);
                sourceAudioNode.gainEnvelope.gain.linearRampToValueAtTime(1, now + this.RAMP_TIME);
            }

            // Connect output to input
            sourceAudioNode.outputNode.connect(targetAudioNode.inputNode);

            // Create analyser for signal visualization (connects in parallel)
            this.createConnectionAnalyser(connectionKey, sourceAudioNode.outputNode);
        } catch (e) {
            // Connection may already exist, that's fine
            console.debug('Connection already exists or failed:', e);
        }
    }

    /**
     * Disconnect two audio nodes
     */
    disconnectAudioNodes(sourceNodeId: string, targetNodeId: string): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        const connectionKey = `${sourceNodeId}->${targetNodeId}`;
        const sourceAudioNode = this.audioNodes.get(sourceNodeId);
        const targetAudioNode = this.audioNodes.get(targetNodeId);

        if (!sourceAudioNode?.outputNode || !targetAudioNode?.inputNode) {
            return;
        }

        // Capture current generation - if it changes before timeout, connection was recreated
        const capturedGeneration = this.connectionGenerations.get(connectionKey) || 0;

        // Fade out before disconnecting
        if (sourceAudioNode.gainEnvelope) {
            const now = ctx.currentTime;
            sourceAudioNode.gainEnvelope.gain.setValueAtTime(
                sourceAudioNode.gainEnvelope.gain.value,
                now
            );
            sourceAudioNode.gainEnvelope.gain.linearRampToValueAtTime(0, now + this.RAMP_TIME);

            // Track and disconnect after fade (can be canceled if reconnected)
            const timeoutId = window.setTimeout(() => {
                // Double-check: verify generation hasn't changed (connection wasn't recreated)
                // This prevents race conditions even if timeout cancellation fails
                const currentGeneration = this.connectionGenerations.get(connectionKey) || 0;
                if (currentGeneration !== capturedGeneration) {
                    // Connection was recreated - don't disconnect
                    this.pendingDisconnects.delete(connectionKey);
                    return;
                }

                // Verify key still exists - callback may fire after reconnection canceled it
                if (this.pendingDisconnects.has(connectionKey)) {
                    this.pendingDisconnects.delete(connectionKey);
                    if (sourceAudioNode.outputNode && targetAudioNode.inputNode) {
                        try {
                            sourceAudioNode.outputNode.disconnect(targetAudioNode.inputNode);
                        } catch {
                            // May not be connected
                        }
                    }
                    // Remove analyser for signal visualization
                    this.removeConnectionAnalyser(connectionKey);
                }
            }, this.RAMP_TIME * 1000 + this.RAMP_SAFETY_BUFFER_MS);

            this.pendingDisconnects.set(connectionKey, timeoutId);
        } else {
            if (sourceAudioNode.outputNode && targetAudioNode.inputNode) {
                try {
                    sourceAudioNode.outputNode.disconnect(targetAudioNode.inputNode);
                } catch {
                    // May not be connected
                }
            }
            // Remove analyser for signal visualization
            this.removeConnectionAnalyser(connectionKey);
        }
    }

    // ============================================================================
    // Public API for Node Components
    // ============================================================================

    /**
     * Get instrument instance for a node
     */
    getInstrument(nodeId: string): SampledInstrument | null {
        const audioNode = this.audioNodes.get(nodeId);
        // Check if instance has required instrument methods
        if (audioNode?.instance &&
            'playNote' in audioNode.instance &&
            'stopNote' in audioNode.instance &&
            'stopAllNotes' in audioNode.instance) {
            return audioNode.instance as SampledInstrument;
        }
        return null;
    }

    /**
     * Get effect instance for a node
     */
    getEffect(nodeId: string): Effect | null {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof Effect) {
            return audioNode.instance;
        }
        return null;
    }

    /**
     * Get looper instance for a node
     */
    getLooper(nodeId: string): Looper | null {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof Looper) {
            return audioNode.instance;
        }
        return null;
    }

    /**
     * Get recorder instance for a node
     */
    getRecorder(nodeId: string): Recorder | null {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof Recorder) {
            return audioNode.instance;
        }
        return null;
    }

    /**
     * Update amplifier gain
     */
    updateAmplifierGain(nodeId: string, gain: number): void {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof GainNode) {
            const ctx = getAudioContext();
            if (ctx) {
                const now = ctx.currentTime;
                audioNode.instance.gain.setValueAtTime(audioNode.instance.gain.value, now);
                audioNode.instance.gain.linearRampToValueAtTime(gain, now + this.RAMP_TIME);
            }
        }
    }

    /**
     * Update speaker volume/mute
     */
    updateSpeakerVolume(nodeId: string, volume: number, isMuted: boolean): void {
        const audioNode = this.audioNodes.get(nodeId);
        if (!audioNode) return;

        const ctx = getAudioContext();
        if (!ctx) return;

        const targetGain = isMuted ? 0 : volume;
        const now = ctx.currentTime;

        // Handle both old GainNode instances and new speaker instance structure
        if (audioNode.instance instanceof GainNode) {
            audioNode.instance.gain.setValueAtTime(audioNode.instance.gain.value, now);
            audioNode.instance.gain.linearRampToValueAtTime(targetGain, now + this.RAMP_TIME);
        } else if (audioNode.instance && typeof audioNode.instance === 'object' && 'gainNode' in audioNode.instance) {
            const speakerInstance = audioNode.instance as { gainNode: GainNode };
            speakerInstance.gainNode.gain.setValueAtTime(speakerInstance.gainNode.gain.value, now);
            speakerInstance.gainNode.gain.linearRampToValueAtTime(targetGain, now + this.RAMP_TIME);
        }
    }

    /**
     * Check if browser supports setSinkId for output device selection
     */
    private supportsSetSinkId(): boolean {
        const audio = document.createElement('audio');
        return typeof (audio as any).setSinkId === 'function';
    }

    /**
     * Update speaker output device
     */
    updateSpeakerDevice(nodeId: string, deviceId: string): void {
        const audioNode = this.audioNodes.get(nodeId);
        if (!audioNode?.instance || !('audioElement' in audioNode.instance)) {
            return;
        }

        const instance = audioNode.instance as {
            audioElement: HTMLAudioElement;
            gainNode: GainNode;
            destination: MediaStreamAudioDestinationNode;
        };

        if (this.supportsSetSinkId()) {
            (instance.audioElement as any).setSinkId(deviceId)
                .catch((err: Error) => {
                    console.error('Failed to switch output device:', err);
                });
        }
    }

    /**
     * Connect microphone stream to a node
     */
    async connectMicrophone(nodeId: string): Promise<MediaStreamAudioSourceNode | null> {
        const ctx = getAudioContext();
        if (!ctx) return null;

        const audioNode = this.audioNodes.get(nodeId);
        if (!audioNode) return null;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            const micSource = ctx.createMediaStreamSource(stream);

            if (audioNode.gainEnvelope) {
                micSource.connect(audioNode.gainEnvelope);
            }

            audioNode.instance = micSource;
            return micSource;
        } catch (e) {
            console.error('Failed to get microphone:', e);
            return null;
        }
    }

    /**
     * Disconnect microphone from a node
     */
    disconnectMicrophone(nodeId: string): void {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode?.instance instanceof MediaStreamAudioSourceNode) {
            audioNode.instance.disconnect();
            // Stop the media stream tracks
            const mediaStream = audioNode.instance.mediaStream;
            mediaStream.getTracks().forEach(track => track.stop());
            audioNode.instance = null;
        }
    }

    /**
     * Set the output node for a microphone (called from MicrophoneNode component)
     * This allows the component to manage its own audio stream while routing through connections
     */
    setMicrophoneOutput(nodeId: string, outputNode: GainNode): void {
        const audioNode = this.audioNodes.get(nodeId);
        if (audioNode) {
            // Disconnect old output if exists (may throw if already disconnected)
            if (audioNode.outputNode) {
                try {
                    audioNode.outputNode.disconnect();
                } catch {
                    // Node may already be disconnected - safe to ignore
                }
            }
            audioNode.outputNode = outputNode;

            // Re-establish any existing connections from this node
            this.reconnectNodeOutputs(nodeId);
        }
    }

    /**
     * Reconnect all outputs from a node (used when output node changes)
     */
    private reconnectNodeOutputs(nodeId: string): void {
        const audioNode = this.audioNodes.get(nodeId);
        if (!audioNode?.outputNode) return;

        // Get connections from graphStore
        const graphConnections = useGraphStore.getState().connections;

        // Find all audio connections from this node and reconnect
        for (const [, connection] of graphConnections) {
            if (connection.sourceNodeId === nodeId && connection.type === 'audio') {
                const targetAudioNode = this.audioNodes.get(connection.targetNodeId);
                if (targetAudioNode?.inputNode) {
                    try {
                        audioNode.outputNode.connect(targetAudioNode.inputNode);
                    } catch (e) {
                        // Connection might already exist
                    }
                }
            }
        }
    }

    // ============================================================================
    // Keyboard Note Triggering
    // ============================================================================

    /**
     * Trigger a note from keyboard input
     * @param keyboardId - The keyboard node ID
     * @param row - The active row (1, 2, or 3)
     * @param keyIndex - The key index within the row (0-11 for chromatic octave)
     * @param velocity - Normalized velocity (0-1), defaults to 0.8
     */
    triggerKeyboardNote(keyboardId: string, row: number, keyIndex: number, velocity: number = 0.8): void {
        // Validate input bounds to prevent array access errors
        if (row < MIN_KEYBOARD_ROW || row > MAX_KEYBOARD_ROW) return;
        if (keyIndex < MIN_KEY_INDEX || keyIndex > MAX_KEY_INDEX) return;

        const graphConnections = useGraphStore.getState().connections;
        const graphNodes = useGraphStore.getState().nodes;

        // Get the keyboard node
        const keyboardNode = graphNodes.get(keyboardId);
        if (!keyboardNode) return;

        // Get keyboard's row octave settings
        const keyboardData = keyboardNode.data as { rowOctaves?: number[] };
        const rowOctaves = keyboardData.rowOctaves ?? [4, 3, 2]; // Default octaves for rows 1, 2, 3
        const baseOctave = rowOctaves[row - 1] ?? 4;

        // Find which output port to use
        // With hierarchical canvas system, ports are auto-generated from internal canvas-output nodes
        let sourcePortId: string | undefined;

        // Try to find a port that matches this row
        sourcePortId = keyboardNode.ports.find(
            p => p.direction === 'output' && p.name.toLowerCase().includes(`row ${row}`)
        )?.id;

        // If no row-specific port found, try to use first available output port
        if (!sourcePortId) {
            sourcePortId = keyboardNode.ports.find(p => p.direction === 'output')?.id;
        }

        if (!sourcePortId) return;

        // Find all connections from this port (control connections to instruments)
        for (const [, connection] of graphConnections) {
            if (connection.sourceNodeId === keyboardId && connection.sourcePortId === sourcePortId) {
                const targetNodeId = connection.targetNodeId;
                const targetNode = graphNodes.get(targetNodeId);

                if (!targetNode) continue;

                // Check if target is an instrument
                if (!INSTRUMENT_NODE_TYPES.includes(targetNode.type as typeof INSTRUMENT_NODE_TYPES[number])) continue;

                // Validate instrument data with type guard
                if (!isInstrumentNodeData(targetNode.data)) continue;
                const instrumentData = targetNode.data;

                const targetPortId = connection.targetPortId;
                const semitoneOffset = instrumentData.offsets[targetPortId] ?? 0;
                const octaveOffset = instrumentData.octaveOffsets?.[targetPortId] ?? 0;
                const noteOffset = instrumentData.noteOffsets?.[targetPortId] ?? 0;

                // Calculate final note
                const finalOctave = baseOctave + octaveOffset;
                const finalNoteIndex = keyIndex + noteOffset + semitoneOffset;

                // Convert to note name string (e.g., "C4", "D#4")
                const noteName = getNoteName(finalNoteIndex, finalOctave);

                // Get the instrument and play the note with normalized velocity
                const instrument = this.getInstrument(targetNodeId);
                if (instrument) {
                    instrument.playNote(noteName, velocity);
                }
            }
        }
    }

    /**
     * Release a note from keyboard input
     * @param keyboardId - The keyboard node ID
     * @param row - The active row (1, 2, or 3)
     * @param keyIndex - The key index within the row (0-11 for chromatic octave)
     */
    releaseKeyboardNote(keyboardId: string, row: number, keyIndex: number): void {
        // Validate input bounds to prevent array access errors
        if (row < MIN_KEYBOARD_ROW || row > MAX_KEYBOARD_ROW) return;
        if (keyIndex < MIN_KEY_INDEX || keyIndex > MAX_KEY_INDEX) return;

        const graphConnections = useGraphStore.getState().connections;
        const graphNodes = useGraphStore.getState().nodes;

        // Get the keyboard node
        const keyboardNode = graphNodes.get(keyboardId);
        if (!keyboardNode) return;

        // Check if keyboard is using bundled output (simple mode) or individual ports (advanced mode)
        const bundlePort = keyboardNode.ports.find(p => p.id === 'bundle-out');

        let sourcePortId: string | undefined;

        if (bundlePort) {
            // Simple mode: use bundle port
            sourcePortId = 'bundle-out';
        } else {
            // Advanced mode or legacy: find the specific row port
            sourcePortId = keyboardNode.ports.find(
                p => p.direction === 'output' && p.name.toLowerCase().includes(`row ${row}`)
            )?.id;
        }

        if (!sourcePortId) return;

        // Get keyboard's row octave settings
        const keyboardData = keyboardNode.data as { rowOctaves?: number[] };
        const rowOctaves = keyboardData.rowOctaves ?? [4, 3, 2];
        const baseOctave = rowOctaves[row - 1] ?? 4;

        // Find all connections from this port
        for (const [, connection] of graphConnections) {
            if (connection.sourceNodeId === keyboardId && connection.sourcePortId === sourcePortId) {
                const targetNodeId = connection.targetNodeId;
                const targetNode = graphNodes.get(targetNodeId);

                if (!targetNode) continue;

                // Check if target is an instrument
                if (!INSTRUMENT_NODE_TYPES.includes(targetNode.type as typeof INSTRUMENT_NODE_TYPES[number])) continue;

                // Validate instrument data with type guard
                if (!isInstrumentNodeData(targetNode.data)) continue;
                const instrumentData = targetNode.data;

                const targetPortId = connection.targetPortId;
                const semitoneOffset = instrumentData.offsets[targetPortId] ?? 0;
                const octaveOffset = instrumentData.octaveOffsets?.[targetPortId] ?? 0;
                const noteOffset = instrumentData.noteOffsets?.[targetPortId] ?? 0;

                // Calculate final note (same as trigger)
                const finalOctave = baseOctave + octaveOffset;
                const finalNoteIndex = keyIndex + noteOffset + semitoneOffset;

                // Convert to note name string
                const noteName = getNoteName(finalNoteIndex, finalOctave);

                // Get the instrument and stop the note
                const instrument = this.getInstrument(targetNodeId);
                if (instrument) {
                    instrument.stopNote(noteName);
                }
            }
        }
    }

    /**
     * Trigger control signal on (e.g., sustain pedal down, switch on)
     * Routes control signal from keyboard to connected instruments
     * @param keyboardId - The keyboard node ID
     */
    triggerControlDown(keyboardId: string): void {
        const graphConnections = useGraphStore.getState().connections;
        const graphNodes = useGraphStore.getState().nodes;

        // Get the keyboard node
        const keyboardNode = graphNodes.get(keyboardId);
        if (!keyboardNode) return;

        // Find the control port
        const controlPortId = keyboardNode.ports.find(
            p => p.direction === 'output' && p.id === 'control'
        )?.id;

        if (!controlPortId) return;

        // Find all connections from the control port
        for (const [, connection] of graphConnections) {
            if (connection.sourceNodeId === keyboardId && connection.sourcePortId === controlPortId) {
                const targetNodeId = connection.targetNodeId;
                const targetNode = graphNodes.get(targetNodeId);

                if (!targetNode) continue;

                // Check if target is a piano instrument
                if (targetNode.type !== 'piano') continue;

                // Get the instrument and activate control (pedal)
                const instrument = this.getInstrument(targetNodeId);
                if (instrument && 'setPedal' in instrument) {
                    (instrument as TonePianoInstrument).setPedal(true);
                }
            }
        }
    }

    /**
     * Trigger control signal off (e.g., sustain pedal up, switch off)
     * Routes control signal from keyboard to connected instruments
     * @param keyboardId - The keyboard node ID
     */
    triggerControlUp(keyboardId: string): void {
        const graphConnections = useGraphStore.getState().connections;
        const graphNodes = useGraphStore.getState().nodes;

        // Get the keyboard node
        const keyboardNode = graphNodes.get(keyboardId);
        if (!keyboardNode) return;

        // Find the control port
        const controlPortId = keyboardNode.ports.find(
            p => p.direction === 'output' && p.id === 'control'
        )?.id;

        if (!controlPortId) return;

        // Find all connections from the control port
        for (const [, connection] of graphConnections) {
            if (connection.sourceNodeId === keyboardId && connection.sourcePortId === controlPortId) {
                const targetNodeId = connection.targetNodeId;
                const targetNode = graphNodes.get(targetNodeId);

                if (!targetNode) continue;

                // Check if target is a piano instrument
                if (targetNode.type !== 'piano') continue;

                // Get the instrument and deactivate control (pedal)
                const instrument = this.getInstrument(targetNodeId);
                if (instrument && 'setPedal' in instrument) {
                    (instrument as TonePianoInstrument).setPedal(false);
                }
            }
        }
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const audioGraphManager = new AudioGraphManager();
