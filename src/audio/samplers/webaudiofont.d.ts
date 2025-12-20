/**
 * Type declarations for webaudiofont
 */

declare module 'webaudiofont' {
  export interface WebAudioFontLoader {
    startLoad(ctx: AudioContext, url: string, name: string): void;
    waitLoad(callback: () => void): void;
  }

  export class WebAudioFontPlayer {
    loader: WebAudioFontLoader;
    queueWaveTable(
      ctx: AudioContext,
      destination: AudioNode,
      preset: unknown,
      when: number,
      pitch: number,
      duration: number,
      volume: number,
      slides?: unknown[]
    ): { cancel: () => void };
    cancelQueue(ctx: AudioContext): void;
  }
}
