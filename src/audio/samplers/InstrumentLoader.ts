/**
 * InstrumentLoader - Central loader and cache manager for sampled instruments
 */

import type { InstrumentDefinition, InstrumentCategory } from './types';
import { SampledInstrument } from './SampledInstrument';
import { SmplrInstrument } from './SmplrAdapter';
import { ToneSamplerInstrument, createSalamanderPiano } from './ToneSamplerAdapter';
import { TonePianoInstrument } from './TonePianoAdapter';
import { WebAudioFontInstrument } from './WebAudioFontAdapter';
import { KarplusStrongInstrument } from './KarplusStrong';
import { INSTRUMENT_DEFINITIONS } from './InstrumentDefinitions';

class InstrumentLoaderClass {
  private cache: Map<string, SampledInstrument> = new Map();
  private definitions: Map<string, InstrumentDefinition> = new Map();

  constructor() {
    INSTRUMENT_DEFINITIONS.forEach(def => {
      this.definitions.set(def.id, def);
    });
  }

  getDefinition(id: string): InstrumentDefinition | undefined {
    return this.definitions.get(id);
  }

  getAllDefinitions(): InstrumentDefinition[] {
    return Array.from(this.definitions.values());
  }

  getDefinitionsByCategory(category: InstrumentCategory): InstrumentDefinition[] {
    return this.getAllDefinitions().filter(d => d.category === category);
  }

  getCategories(): InstrumentCategory[] {
    const categories = new Set<InstrumentCategory>();
    this.definitions.forEach(def => categories.add(def.category));
    return Array.from(categories);
  }

  /**
   * Create a new instrument instance (uses cache for sample data, not routing)
   * Each node should have its own instance for independent audio routing
   */
  create(instrumentId: string): SampledInstrument {
    // Always create a new instance for each node (routing must be independent)
    return this.createNew(instrumentId);
  }

  /**
   * Create a fresh instrument instance (no caching)
   */
  createNew(instrumentId: string): SampledInstrument {
    const def = this.definitions.get(instrumentId);
    if (!def) {
      console.warn(`Unknown instrument: ${instrumentId}, falling back to piano`);
      return this.createNew('salamander-piano');
    }

    let instrument: SampledInstrument;

    switch (def.library) {
      case 'smplr':
        instrument = new SmplrInstrument(def.config.instrument as 'cello' | 'violin' | 'viola' | 'double-bass');
        break;

      case 'tonejs-piano':
        instrument = new TonePianoInstrument({
          velocities: (def.config.velocities as 1 | 4 | 5 | 16) ?? 5,
          envelope: def.envelope
        });
        break;

      case 'tone':
        if (instrumentId === 'salamander-piano') {
          instrument = createSalamanderPiano();
        } else {
          instrument = new ToneSamplerInstrument(def.config as never);
        }
        break;

      case 'webaudiofont':
        instrument = new WebAudioFontInstrument(def.config as { presetUrl: string; presetVar: string });
        break;

      case 'karplus':
        instrument = new KarplusStrongInstrument(
          (def.config.brightness as number) ?? 0.5,
          (def.config.dampening as number) ?? 0.99
        );
        break;

      default:
        instrument = createSalamanderPiano(); // Fallback
    }

    return instrument;
  }

  // Preload an instrument (useful for UI-triggered preloading)
  async preload(instrumentId: string): Promise<void> {
    const instrument = this.create(instrumentId);
    await instrument.load();
  }

  // Clear cache (memory management)
  clearCache(): void {
    this.cache.forEach(inst => inst.disconnect());
    this.cache.clear();
  }

  // Remove specific instrument from cache
  removeFromCache(instrumentId: string): void {
    const inst = this.cache.get(instrumentId);
    if (inst) {
      inst.disconnect();
      this.cache.delete(instrumentId);
    }
  }
}

export const InstrumentLoader = new InstrumentLoaderClass();
