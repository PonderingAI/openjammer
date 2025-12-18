/**
 * BeatClock - Global timing reference for synchronized loopers
 *
 * Provides a shared beat clock that all loopers can sync to.
 * Uses Web Audio API's precise timing for accurate beat scheduling.
 */

import { getAudioContext } from './AudioEngine';

// ============================================================================
// Types
// ============================================================================

export interface BeatClockState {
    bpm: number;
    isPlaying: boolean;
    currentBeat: number;
    startTime: number;
    beatsPerBar: number;
}

type BeatCallback = (beat: number, time: number) => void;
type StateChangeCallback = (state: BeatClockState) => void;

// ============================================================================
// BeatClock Class
// ============================================================================

class BeatClock {
    private bpm: number = 120;
    private isPlaying: boolean = false;
    private startTime: number = 0;
    private beatsPerBar: number = 4;

    // Scheduling
    private schedulerInterval: number | null = null;
    private scheduleAheadTime: number = 0.1; // How far ahead to schedule (seconds)
    private lookahead: number = 25; // How often to call scheduler (ms)
    private nextBeatTime: number = 0;
    private currentBeat: number = 0;

    // Callbacks
    private beatCallbacks: Set<BeatCallback> = new Set();
    private stateCallbacks: Set<StateChangeCallback> = new Set();

    // Scheduled events
    private scheduledEvents: Map<number, (() => void)[]> = new Map();

    /**
     * Get seconds per beat at current BPM
     */
    get secondsPerBeat(): number {
        return 60 / this.bpm;
    }

    /**
     * Get current BPM
     */
    getBPM(): number {
        return this.bpm;
    }

    /**
     * Set BPM
     */
    setBPM(bpm: number): void {
        this.bpm = Math.max(20, Math.min(300, bpm));
        this.notifyStateChange();
    }

    /**
     * Get beats per bar
     */
    getBeatsPerBar(): number {
        return this.beatsPerBar;
    }

    /**
     * Set beats per bar
     */
    setBeatsPerBar(beats: number): void {
        this.beatsPerBar = Math.max(1, Math.min(16, beats));
        this.notifyStateChange();
    }

    /**
     * Check if clock is playing
     */
    getIsPlaying(): boolean {
        return this.isPlaying;
    }

    /**
     * Get current beat number
     */
    getCurrentBeat(): number {
        return this.currentBeat;
    }

    /**
     * Get current state
     */
    getState(): BeatClockState {
        return {
            bpm: this.bpm,
            isPlaying: this.isPlaying,
            currentBeat: this.currentBeat,
            startTime: this.startTime,
            beatsPerBar: this.beatsPerBar
        };
    }

    /**
     * Start the beat clock
     */
    start(): void {
        if (this.isPlaying) return;

        const ctx = getAudioContext();
        if (!ctx) return;

        this.isPlaying = true;
        this.startTime = ctx.currentTime;
        this.nextBeatTime = ctx.currentTime;
        this.currentBeat = 0;

        // Start the scheduler
        this.schedulerInterval = window.setInterval(() => {
            this.scheduler();
        }, this.lookahead);

        this.notifyStateChange();
    }

    /**
     * Stop the beat clock
     */
    stop(): void {
        if (!this.isPlaying) return;

        this.isPlaying = false;
        this.currentBeat = 0;

        if (this.schedulerInterval !== null) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }

        // Clear scheduled events
        this.scheduledEvents.clear();

        this.notifyStateChange();
    }

    /**
     * Toggle play/stop
     */
    toggle(): void {
        if (this.isPlaying) {
            this.stop();
        } else {
            this.start();
        }
    }

    /**
     * Internal scheduler - runs frequently to schedule upcoming beats
     */
    private scheduler(): void {
        const ctx = getAudioContext();
        if (!ctx) return;

        // Schedule all beats that fall within the lookahead window
        while (this.nextBeatTime < ctx.currentTime + this.scheduleAheadTime) {
            this.scheduleBeat(this.currentBeat, this.nextBeatTime);
            this.nextBeatTime += this.secondsPerBeat;
            this.currentBeat++;
        }
    }

    /**
     * Schedule a beat and notify callbacks
     */
    private scheduleBeat(beat: number, time: number): void {
        // Notify beat callbacks
        this.beatCallbacks.forEach(callback => {
            try {
                callback(beat, time);
            } catch (e) {
                console.error('Beat callback error:', e);
            }
        });

        // Execute any scheduled events for this beat
        const events = this.scheduledEvents.get(beat);
        if (events) {
            events.forEach(callback => {
                try {
                    callback();
                } catch (e) {
                    console.error('Scheduled event error:', e);
                }
            });
            this.scheduledEvents.delete(beat);
        }
    }

    /**
     * Subscribe to beat events
     */
    onBeat(callback: BeatCallback): () => void {
        this.beatCallbacks.add(callback);
        return () => {
            this.beatCallbacks.delete(callback);
        };
    }

    /**
     * Subscribe to state changes
     */
    onStateChange(callback: StateChangeCallback): () => void {
        this.stateCallbacks.add(callback);
        return () => {
            this.stateCallbacks.delete(callback);
        };
    }

    /**
     * Notify state change subscribers
     */
    private notifyStateChange(): void {
        const state = this.getState();
        this.stateCallbacks.forEach(callback => {
            try {
                callback(state);
            } catch (e) {
                console.error('State callback error:', e);
            }
        });
    }

    /**
     * Schedule a callback at a specific beat
     */
    scheduleAt(beat: number, callback: () => void): void {
        if (!this.scheduledEvents.has(beat)) {
            this.scheduledEvents.set(beat, []);
        }
        this.scheduledEvents.get(beat)!.push(callback);
    }

    /**
     * Get the time of the next beat
     */
    getNextBeatTime(): number {
        const ctx = getAudioContext();
        if (!ctx || !this.isPlaying) return 0;

        return this.nextBeatTime;
    }

    /**
     * Snap a time value to the nearest beat
     */
    snapToBeat(time: number): number {
        if (!this.isPlaying) return time;

        const beatDuration = this.secondsPerBeat;
        const elapsedFromStart = time - this.startTime;
        const beatIndex = Math.round(elapsedFromStart / beatDuration);
        return this.startTime + beatIndex * beatDuration;
    }

    /**
     * Snap a duration to the nearest number of beats
     */
    snapDurationToBeats(duration: number): number {
        const beatDuration = this.secondsPerBeat;
        const beats = Math.round(duration / beatDuration);
        return Math.max(1, beats) * beatDuration;
    }

    /**
     * Get loop duration in beats for a given duration in seconds
     */
    getBeatsForDuration(duration: number): number {
        return Math.round(duration / this.secondsPerBeat);
    }

    /**
     * Get duration in seconds for a given number of beats
     */
    getDurationForBeats(beats: number): number {
        return beats * this.secondsPerBeat;
    }

    /**
     * Get the current position in the bar (0 to beatsPerBar-1)
     */
    getBarPosition(): number {
        return this.currentBeat % this.beatsPerBar;
    }

    /**
     * Check if current beat is the start of a bar
     */
    isBarStart(): boolean {
        return this.getBarPosition() === 0;
    }

    /**
     * Get the current time position relative to start
     */
    getCurrentTime(): number {
        const ctx = getAudioContext();
        if (!ctx || !this.isPlaying) return 0;

        return ctx.currentTime - this.startTime;
    }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const beatClock = new BeatClock();
