/**
 * MIDI Device Presets Registry
 * Manages device-specific preset configurations for known MIDI controllers
 */

import type { MIDIDevicePreset } from './types';
import { genericPreset } from './presets/generic';
import { arturiaMinilab3Preset } from './presets/arturia-minilab-3';

class MIDIPresetRegistry {
  private static instance: MIDIPresetRegistry | null = null;
  private presets: Map<string, MIDIDevicePreset> = new Map();

  private constructor() {
    // Register built-in presets
    this.registerPreset(genericPreset);
    this.registerPreset(arturiaMinilab3Preset);
  }

  /**
   * Get the singleton instance
   */
  static getInstance(): MIDIPresetRegistry {
    if (!MIDIPresetRegistry.instance) {
      MIDIPresetRegistry.instance = new MIDIPresetRegistry();
    }
    return MIDIPresetRegistry.instance;
  }

  /**
   * Register a preset
   */
  registerPreset(preset: MIDIDevicePreset): void {
    this.presets.set(preset.id, preset);
  }

  /**
   * Get a preset by ID
   */
  getPreset(id: string): MIDIDevicePreset | null {
    return this.presets.get(id) ?? null;
  }

  /**
   * Get all registered presets
   */
  getAllPresets(): MIDIDevicePreset[] {
    return Array.from(this.presets.values());
  }

  /**
   * Get all presets except generic
   */
  getDevicePresets(): MIDIDevicePreset[] {
    return this.getAllPresets().filter((p) => p.id !== 'generic');
  }

  /**
   * Try to match a device name to a preset
   * Returns null if no match found (use generic)
   */
  matchDevice(deviceName: string): MIDIDevicePreset | null {
    const normalizedName = deviceName.toLowerCase();

    for (const preset of this.presets.values()) {
      if (preset.id === 'generic') continue;

      for (const pattern of preset.matchPatterns) {
        if (normalizedName.includes(pattern.toLowerCase())) {
          return preset;
        }
      }
    }

    return null;
  }

  /**
   * Check if a device should use a specific port
   * (Some devices like MiniLab 3 have multiple ports, we only want the main one)
   */
  shouldUsePort(deviceName: string, preset: MIDIDevicePreset): boolean {
    // If no preferred port specified, use all ports
    if (!preset.preferredPort) return true;

    // Check if device name matches preferred port pattern
    const normalizedName = deviceName.toLowerCase();
    if (normalizedName.includes(preset.preferredPort.toLowerCase())) {
      return true;
    }

    // Check if port should be ignored
    if (preset.ignorePorts) {
      for (const ignorePattern of preset.ignorePorts) {
        if (normalizedName.includes(ignorePattern.toLowerCase())) {
          return false;
        }
      }
    }

    // If has preferred port but device name doesn't match, still allow
    // (in case device naming varies by OS/driver)
    return true;
  }

  /**
   * Get bundle configurations for a preset
   * Returns groups of controls that can be bundled together
   */
  getBundleConfigs(preset: MIDIDevicePreset): MIDIBundleConfig[] {
    const bundles: MIDIBundleConfig[] = [];

    if (preset.controls.keys) {
      const { noteRange } = preset.controls.keys;
      bundles.push({
        id: 'keys',
        name: 'Keys',
        type: 'notes',
        count: noteRange[1] - noteRange[0] + 1,
        channel: preset.controls.keys.channel,
      });
    }

    if (preset.controls.pads && preset.controls.pads.length > 0) {
      bundles.push({
        id: 'pads',
        name: 'Pads',
        type: 'notes',
        count: preset.controls.pads.length,
        channel: preset.controls.pads[0].channel,
      });
    }

    if (preset.controls.knobs && preset.controls.knobs.length > 0) {
      bundles.push({
        id: 'knobs',
        name: 'Knobs',
        type: 'cc',
        count: preset.controls.knobs.length,
        channel: preset.controls.knobs[0].channel,
      });
    }

    if (preset.controls.faders && preset.controls.faders.length > 0) {
      bundles.push({
        id: 'faders',
        name: 'Faders',
        type: 'cc',
        count: preset.controls.faders.length,
        channel: preset.controls.faders[0].channel,
      });
    }

    if (preset.controls.pitchBend) {
      bundles.push({
        id: 'pitchBend',
        name: 'Pitch Bend',
        type: 'pitchBend',
        count: 1,
        channel: preset.controls.pitchBend.channel,
      });
    }

    if (preset.controls.modWheel) {
      bundles.push({
        id: 'modWheel',
        name: 'Mod Wheel',
        type: 'cc',
        count: 1,
        channel: preset.controls.modWheel.channel,
      });
    }

    return bundles;
  }
}

/**
 * Bundle configuration for output grouping
 */
export interface MIDIBundleConfig {
  id: string;
  name: string;
  type: 'notes' | 'cc' | 'pitchBend';
  count: number;
  channel: number;
}

/**
 * Get the preset registry singleton
 */
export function getPresetRegistry(): MIDIPresetRegistry {
  return MIDIPresetRegistry.getInstance();
}

// Export for testing
export { MIDIPresetRegistry };
