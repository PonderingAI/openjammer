/**
 * MIDI Store
 * Zustand store for managing MIDI device state
 * Uses vanilla store with subscribeWithSelector for transient updates
 */

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { getMIDIManager, getPresetRegistry } from '../midi';
import type { MIDIDeviceInfo, MIDIDevicePreset, MIDIEvent } from '../midi/types';

// ============================================================================
// Store State
// ============================================================================

interface MIDIStoreState {
    // Initialization state
    isSupported: boolean;
    isInitialized: boolean;
    error: string | null;

    // Connected devices
    inputs: Map<string, MIDIDeviceInfo>;
    outputs: Map<string, MIDIDeviceInfo>;

    // Active subscriptions (deviceId -> unsubscribe function)
    subscriptions: Map<string, () => void>;

    // Real-time data (use transient updates for high-frequency data)
    lastMessage: MIDIEvent | null;

    // Device browser state
    isBrowserOpen: boolean;
    browserSearchQuery: string;

    // Auto-detect toast state
    pendingDevice: MIDIDeviceInfo | null;
    detectedPreset: MIDIDevicePreset | null;
}

interface MIDIStoreActions {
    // Initialization
    initialize: () => Promise<void>;

    // Device management
    subscribeToDevice: (deviceId: string, callback: (event: MIDIEvent) => void) => () => void;
    unsubscribeFromDevice: (deviceId: string) => void;

    // Browser
    openBrowser: () => void;
    closeBrowser: () => void;
    setSearchQuery: (query: string) => void;

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
    subscribeWithSelector((set, get) => ({
        // Initial state
        isSupported: typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator,
        isInitialized: false,
        error: null,

        inputs: new Map(),
        outputs: new Map(),
        subscriptions: new Map(),

        lastMessage: null,

        isBrowserOpen: false,
        browserSearchQuery: '',

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

            // Set up hot-plug listeners
            manager.onDeviceConnected((device) => {
                get().handleDeviceConnected(device);
            });

            manager.onDeviceDisconnected((device) => {
                get().handleDeviceDisconnected(device);
            });

            set({
                isInitialized: true,
                inputs,
                outputs
            });
        },

        // ================================================================
        // Device Management
        // ================================================================

        subscribeToDevice: (deviceId, callback) => {
            const manager = getMIDIManager();
            const subscription = manager.subscribe(deviceId, (event) => {
                get().handleMIDIMessage(event);
                callback(event);
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
        // Browser
        // ================================================================

        openBrowser: () => {
            set({ isBrowserOpen: true, browserSearchQuery: '' });
        },

        closeBrowser: () => {
            set({ isBrowserOpen: false });
        },

        setSearchQuery: (query) => {
            set({ browserSearchQuery: query });
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

            // Show auto-detect toast
            set({
                pendingDevice: device,
                detectedPreset: preset
            });

            // Auto-dismiss after 10 seconds
            setTimeout(() => {
                const current = get().pendingDevice;
                if (current?.id === device.id) {
                    set({ pendingDevice: null, detectedPreset: null });
                }
            }, 10000);
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
            // Update last message (for debugging/monitoring)
            set({ lastMessage: event });
        }
    }))
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
