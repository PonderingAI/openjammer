/**
 * InstrumentDefinitions - Configuration for all available instruments
 */

import type { InstrumentDefinition } from './types';
import { GM_INSTRUMENTS } from './GM_INSTRUMENTS';

export const INSTRUMENT_DEFINITIONS: InstrumentDefinition[] = [
  // ============= PIANO =============
  {
    id: 'tonejs-piano',
    name: 'Grand Piano (HD)',
    category: 'piano',
    subCategory: 'Acoustic',
    library: 'tonejs-piano',
    config: { velocities: 5 }, // 5 velocity layers (can be 1, 4, 5, or 16)
    defaultOctave: 4,
    noteRange: { min: 'A0', max: 'C8' },
    envelope: {
      releaseTimeConstantByRange: [
        { minNote: 'A0', maxNote: 'C3', timeConstant: 0.15 },  // Bass - longer resonance
        { minNote: 'C#3', maxNote: 'C5', timeConstant: 0.08 }, // Mid - medium damping
        { minNote: 'C#5', maxNote: 'C8', timeConstant: 0.05 }  // Treble - quick damping
      ]
    },
    velocityCurve: 'exponential' // More dynamic range
  },

  // Salamander Piano (Legacy - single velocity layer)
  {
    id: 'salamander-piano',
    name: 'Grand Piano (Standard)',
    category: 'piano',
    subCategory: 'Acoustic',
    library: 'tone',
    config: { type: 'salamander' },
    defaultOctave: 4,
    noteRange: { min: 'A0', max: 'C8' },
    envelope: {
      releaseTimeConstant: 0.08
    }
  },

  // ============= STRINGS (smplr Versilian) =============
  // NOTE: Versilian samples are no longer available (404)
  // These instruments are disabled until alternative sample sources are found
  // Use GM strings (gm-cello, gm-violin, etc.) from WebAudioFont instead

  // ============= GUITAR (Karplus-Strong + WebAudioFont) =============
  {
    id: 'karplus-acoustic',
    name: 'Acoustic Guitar',
    category: 'guitar',
    subCategory: 'Acoustic',
    library: 'karplus',
    config: { brightness: 0.6, dampening: 0.995 },
    defaultOctave: 3,
    envelope: {
      releaseTimeConstant: 0.08 // Natural muting
    },
    velocityCurve: 'exponential'
  },
  {
    id: 'karplus-electric',
    name: 'Electric Guitar',
    category: 'guitar',
    subCategory: 'Electric',
    library: 'karplus',
    config: { brightness: 0.8, dampening: 0.98 },
    defaultOctave: 3,
    envelope: {
      releaseTimeConstant: 0.06 // Quick damping
    },
    velocityCurve: 'exponential'
  },
  {
    id: 'karplus-nylon',
    name: 'Nylon Guitar',
    category: 'guitar',
    subCategory: 'Acoustic',
    library: 'karplus',
    config: { brightness: 0.4, dampening: 0.997 },
    defaultOctave: 3,
    envelope: {
      releaseTimeConstant: 0.10 // Softer damping
    },
    velocityCurve: 'exponential'
  },
  {
    id: 'karplus-harp',
    name: 'Harp',
    category: 'strings',
    subCategory: 'Plucked',
    library: 'karplus',
    config: { brightness: 0.7, dampening: 0.996 },
    defaultOctave: 4,
    envelope: {
      releaseTimeConstant: 0.15 // Long resonance
    },
    velocityCurve: 'linear'
  },

  // ============= GENERAL MIDI (WebAudioFont - 128 instruments) =============
  // All 128 GM instruments imported from GM_INSTRUMENTS
  ...GM_INSTRUMENTS
];
