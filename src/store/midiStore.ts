/**
 * MIDI Store
 * Zustand store for managing MIDI device state
 * Uses vanilla store with subscribeWithSelector for transient updates
 */

import { create } from 'zustand';
import { subscribeWithSelector, persist } from 'zustand/middleware';
import { getMIDIManager, getPresetRegistry } from '../midi';
import type { MIDIDeviceInfo, MIDIDevicePreset, MIDIEvent } from '../midi/types';
import type { MIDIDeviceSignature } from '../engine/types';

// ============================================================================
// Store State
// ============================================================================

// Persisted state (saved to localStorage)
interface MIDIPersistedState {
    // Device name registry: presetId:deviceName -> true (tracks used names)
    usedDeviceNames: Record<string, boolean>;

    // Device signatures by deviceId (for current session matching)
    // deviceId -> { presetId, deviceName }
    deviceSignatures: Record<string, MIDIDeviceSignature>;
}

interface MIDIStoreState extends MIDIPersistedState {
    // Initialization state
    isSupported: boolean;
    isInitialized: boolean;
    error: string | null;

    // Connected devices
    inputs: Map<string, MIDIDeviceInfo>;
    outputs: Map<string, MIDIDeviceInfo>;

    // Active subscriptions (deviceId -> unsubscribe function)
    subscriptions: Map<string, () => void>;

    // Global subscription cleanup function
    globalUnsubscribe: (() => void) | null;

    // Device connection/disconnection listener cleanup functions
    deviceConnectedCleanup: (() => void) | null;
    deviceDisconnectedCleanup: (() => void) | null;

    // Real-time data (use transient updates for high-frequency data)
    lastMessage: MIDIEvent | null;

    // Device browser state
    isBrowserOpen: boolean;
    browserSearchQuery: string;
    browserTargetNodeId: string | null;  // Which node opened the browser (for updating existing nodes)

    // Auto-detect toast state
    pendingDevice: MIDIDeviceInfo | null;
    detectedPreset: MIDIDevicePreset | null;
}

interface MIDIStoreActions {
    // Initialization
    initialize: () => Promise<void>;
    cleanup: () => void;

    // Device management
    subscribeToDevice: (deviceId: string, callback: (event: MIDIEvent) => void) => () => void;
    unsubscribeFromDevice: (deviceId: string) => void;

    // Device naming (auto-generated or user-customized)
    generateDeviceName: (deviceId: string, presetId: string, presetName: string) => string;
    renameDevice: (deviceId: string, newName: string) => boolean;
    getDeviceSignature: (deviceId: string) => MIDIDeviceSignature | null;
    getDeviceBySignature: (signature: MIDIDeviceSignature) => MIDIDeviceInfo | null;
    isDeviceNameUsed: (presetId: string, deviceName: string) => boolean;

    // Browser
    openBrowser: (targetNodeId?: string) => void;
    closeBrowser: () => void;
    setSearchQuery: (query: string) => void;
    getBrowserTargetNodeId: () => string | null;

    // Auto-detect
    dismissPendingDevice: () => void;
    acceptPendingDevice: () => void;

    // Internal handlers
    handleDeviceConnected: (device: MIDIDeviceInfo) => void;
    handleDeviceDisconnected: (device: MIDIDeviceInfo) => void;
    handleMIDIMessage: (event: MIDIEvent) => void;
}

type MIDIStore = MIDIStoreState & MIDIStoreActions;

// ============================================================================
// Store Creation
// ============================================================================

export const useMIDIStore = create<MIDIStore>()(
    subscribeWithSelector(
        persist(
            (set, get) => ({
                // Persisted state (saved to localStorage)
                usedDeviceNames: {},
                deviceSignatures: {},

                // Transient state (not persisted)
                isSupported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
                isInitialized: false,
                error: null,

                inputs: new Map(),
                outputs: new Map(),
                subscriptions: new Map(),
                globalUnsubscribe: null,
                deviceConnectedCleanup: null,
                deviceDisconnectedCleanup: null,

                lastMessage: null,

                isBrowserOpen: false,
                browserSearchQuery: '',
                browserTargetNodeId: null,

                pendingDevice: null,
                detectedPreset: null,

        // ================================================================
        // Initialization
        // ================================================================

        initialize: async () => {
            const state = get();
            if (state.isInitialized || !state.isSupported) return;

            const manager = getMIDIManager();
            const success = await manager.init();

            if (!success) {
                set({ error: manager.getError(), isInitialized: true });
                return;
            }

            // Get initial devices
            const inputs = new Map<string, MIDIDeviceInfo>();
            manager.getInputDevices().forEach((device) => {
                inputs.set(device.id, device);
            });

            const outputs = new Map<string, MIDIDeviceInfo>();
            manager.getOutputDevices().forEach((device) => {
                outputs.set(device.id, device);
            });

            // Set up hot-plug listeners and store cleanup functions
            const deviceConnectedCleanup = manager.onDeviceConnected((device) => {
                get().handleDeviceConnected(device);
            });

            const deviceDisconnectedCleanup = manager.onDeviceDisconnected((device) => {
                get().handleDeviceDisconnected(device);
            });

            // Subscribe to ALL MIDI messages globally so lastMessage is always updated
            // This allows any component to use subscribeMIDIMessages to react to messages
            // Store the unsubscribe function to prevent memory leaks
            const globalSubscription = manager.subscribeAll((event) => {
                try {
                    get().handleMIDIMessage(event);
                } catch (err) {
                    console.error('[midiStore] Error in global MIDI callback:', err);
                }
            });

            set({
                isInitialized: true,
                inputs,
                outputs,
                globalUnsubscribe: globalSubscription.unsubscribe,
                deviceConnectedCleanup,
                deviceDisconnectedCleanup
            });
        },

        cleanup: () => {
            const state = get();

            // Unsubscribe from global MIDI messages
            if (state.globalUnsubscribe) {
                state.globalUnsubscribe();
            }

            // Unsubscribe from device connection/disconnection listeners
            if (state.deviceConnectedCleanup) {
                state.deviceConnectedCleanup();
            }
            if (state.deviceDisconnectedCleanup) {
                state.deviceDisconnectedCleanup();
            }

            // Unsubscribe from all device-specific subscriptions
            state.subscriptions.forEach((unsubscribe) => {
                unsubscribe();
            });

            // Destroy MIDIManager to clean up all resources and event handlers
            getMIDIManager().destroy();

            set({
                isInitialized: false,
                globalUnsubscribe: null,
                deviceConnectedCleanup: null,
                deviceDisconnectedCleanup: null,
                subscriptions: new Map(),
                inputs: new Map(),
                outputs: new Map(),
                lastMessage: null
            });
        },

        // ================================================================
        // Device Management
        // ================================================================

        subscribeToDevice: (deviceId, callback) => {
            // Clean up existing subscription for this device before adding new one
            const existingUnsubscribe = get().subscriptions.get(deviceId);
            if (existingUnsubscribe) {
                existingUnsubscribe();
            }

            const manager = getMIDIManager();
            const subscription = manager.subscribe(deviceId, (event) => {
                try {
                    get().handleMIDIMessage(event);
                    callback(event);
                } catch (err) {
                    console.error('[midiStore] Error in subscription callback:', err);
                }
            });

            // Store subscription
            const subscriptions = new Map(get().subscriptions);
            subscriptions.set(deviceId, subscription.unsubscribe);
            set({ subscriptions });

            return subscription.unsubscribe;
        },

        unsubscribeFromDevice: (deviceId) => {
            const subscriptions = get().subscriptions;
            const unsubscribe = subscriptions.get(deviceId);
            if (unsubscribe) {
                unsubscribe();
                const newSubscriptions = new Map(subscriptions);
                newSubscriptions.delete(deviceId);
                set({ subscriptions: newSubscriptions });
            }
        },

        // ================================================================
        // Device Naming
        // ================================================================

        generateDeviceName: (deviceId, presetId, presetName) => {
            const state = get();

            // Check if this device already has a signature
            const existingSig = state.deviceSignatures[deviceId];
            if (existingSig) {
                return existingSig.deviceName;
            }

            // Count existing devices with this presetId to generate suffix
            let suffix = 1;
            let candidateName = presetName;

            while (state.usedDeviceNames[`${presetId}:${candidateName}`]) {
                suffix++;
                candidateName = `${presetName} ${suffix}`;
            }

            // Register the new name
            const signature: MIDIDeviceSignature = { presetId, deviceName: candidateName };
            set({
                usedDeviceNames: {
                    ...state.usedDeviceNames,
                    [`${presetId}:${candidateName}`]: true
                },
                deviceSignatures: {
                    ...state.deviceSignatures,
                    [deviceId]: signature
                }
            });

            return candidateName;
        },

        renameDevice: (deviceId, newName) => {
            const state = get();
            const currentSig = state.deviceSignatures[deviceId];
            if (!currentSig) return false;

            // Check if new name is already used for this preset type
            const newKey = `${currentSig.presetId}:${newName}`;
            if (state.usedDeviceNames[newKey]) {
                return false; // Name already taken
            }

            // Remove old name, add new name
            const oldKey = `${currentSig.presetId}:${currentSig.deviceName}`;
            const newUsedNames = { ...state.usedDeviceNames };
            delete newUsedNames[oldKey];
            newUsedNames[newKey] = true;

            set({
                usedDeviceNames: newUsedNames,
                deviceSignatures: {
                    ...state.deviceSignatures,
                    [deviceId]: { ...currentSig, deviceName: newName }
                }
            });

            return true;
        },

        getDeviceSignature: (deviceId) => {
            return get().deviceSignatures[deviceId] || null;
        },

        getDeviceBySignature: (signature) => {
            const state = get();

            // First, look for exact deviceId match in current signatures
            for (const [deviceId, sig] of Object.entries(state.deviceSignatures)) {
                if (sig.presetId === signature.presetId && sig.deviceName === signature.deviceName) {
                    const device = state.inputs.get(deviceId);
                    if (device?.state === 'connected') {
                        return device;
                    }
                }
            }

            // If no match found, try to find by presetId (for new connections)
            // This handles the case where deviceId changed but it's the same device type
            const registry = getPresetRegistry();
            for (const [, device] of state.inputs) {
                if (device.state !== 'connected') continue;
                const preset = registry.matchDevice(device.name);
                if (preset?.id === signature.presetId) {
                    // Found a matching device type that's not yet named
                    // Check if its default name would match
                    if (!state.deviceSignatures[device.id]) {
                        return device;
                    }
                }
            }

            return null;
        },

        isDeviceNameUsed: (presetId, deviceName) => {
            return !!get().usedDeviceNames[`${presetId}:${deviceName}`];
        },

        // ================================================================
        // Browser
        // ================================================================

        openBrowser: (targetNodeId?: string) => {
            set({
                isBrowserOpen: true,
                browserSearchQuery: '',
                browserTargetNodeId: targetNodeId || null
            });
        },

        closeBrowser: () => {
            set({ isBrowserOpen: false, browserTargetNodeId: null });
        },

        setSearchQuery: (query) => {
            set({ browserSearchQuery: query });
        },

        getBrowserTargetNodeId: () => {
            return get().browserTargetNodeId;
        },

        // ================================================================
        // Auto-detect
        // ================================================================

        dismissPendingDevice: () => {
            set({ pendingDevice: null, detectedPreset: null });
        },

        acceptPendingDevice: () => {
            // This would typically trigger adding the MIDI node to the canvas
            // For now, just dismiss
            set({ pendingDevice: null, detectedPreset: null });
        },

        // ================================================================
        // Internal Handlers
        // ================================================================

        handleDeviceConnected: (device) => {
            if (device.type !== 'input') return;

            // Update inputs map
            const inputs = new Map(get().inputs);
            inputs.set(device.id, device);
            set({ inputs });

            // Try to identify device with preset
            const registry = getPresetRegistry();
            const preset = registry.matchDevice(device.name);

            // Only show auto-detect toast for devices we should use
            // This handles multi-port devices like MiniLab 3 - only show toast for preferred port
            if (preset && !registry.shouldUsePort(device.name, preset)) {
                return; // Don't show toast for non-preferred ports
            }

            // Show auto-detect toast
            // Note: Auto-dismiss is handled by the MIDIAutoDetectToast component
            // to avoid duplicate timers and race conditions
            set({
                pendingDevice: device,
                detectedPreset: preset
            });
        },

        handleDeviceDisconnected: (device) => {
            if (device.type !== 'input') return;

            // Update inputs map
            const inputs = new Map(get().inputs);
            inputs.delete(device.id);
            set({ inputs });

            // Clear pending if it was this device
            if (get().pendingDevice?.id === device.id) {
                set({ pendingDevice: null, detectedPreset: null });
            }

            // Clean up subscriptions
            get().unsubscribeFromDevice(device.id);
        },

        handleMIDIMessage: (event) => {
            // Update last message (for transient subscriptions)
            set({ lastMessage: event });
        }
            }),
            {
                name: 'openjammer-midi-devices',
                // Only persist device naming data
                partialize: (state) => ({
                    usedDeviceNames: state.usedDeviceNames,
                    deviceSignatures: state.deviceSignatures,
                }),
            }
        )
    )
);

// ============================================================================
// Selectors for transient updates
// ============================================================================

/**
 * Subscribe to MIDI messages without triggering React re-renders
 * Use this for real-time visualizations
 */
export function subscribeMIDIMessages(
    callback: (event: MIDIEvent) => void
): () => void {
    return useMIDIStore.subscribe(
        (state) => state.lastMessage,
        (message) => {
            if (message) callback(message);
        }
    );
}

/**
 * Get device list (triggers re-render when devices change)
 */
export function useMIDIInputs(): MIDIDeviceInfo[] {
    return Array.from(useMIDIStore((s) => s.inputs).values());
}

/**
 * Check if a specific device is connected
 */
export function useIsDeviceConnected(deviceId: string | null): boolean {
    const inputs = useMIDIStore((s) => s.inputs);
    if (!deviceId) return false;
    const device = inputs.get(deviceId);
    return device?.state === 'connected';
}
