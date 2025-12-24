/**
 * Generic MIDI Device Preset
 * A fallback preset that works with any MIDI controller
 * Uses MIDI Learn for custom mapping
 */

import type { MIDIDevicePreset } from '../types';

export const genericPreset: MIDIDevicePreset = {
  id: 'generic',
  name: 'Generic MIDI Device',
  manufacturer: 'Any',
  matchPatterns: [], // Never auto-matches, must be selected manually

  controls: {
    // Full MIDI note range
    keys: {
      noteRange: [0, 127],
      channel: 0, // 0 = omni (all channels)
      hasVelocity: true,
      hasAftertouch: true,
    },

    // No pre-defined pads (use MIDI Learn)
    pads: [],

    // No pre-defined knobs (use MIDI Learn)
    knobs: [],

    // No pre-defined faders (use MIDI Learn)
    faders: [],

    // No pre-defined buttons
    buttons: [],

    // Standard pitch bend
    pitchBend: {
      channel: 0, // 0 = omni
    },

    // Standard mod wheel
    modWheel: {
      cc: 1,
      channel: 0, // 0 = omni
    },
  },

  visualization: {
    // No specific visualization - use schematic layout
    svgPath: undefined,
    width: 300,
    height: 200,
    controlPositions: {},
  },
};
