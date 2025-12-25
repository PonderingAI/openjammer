# OpenJammer Latency Optimization Plan

## Goal: Achieve Sub-20ms Latency for Live MIDI Playing

**Current Problem**: >50ms latency in OpenJammer despite Windows being optimized
**Target**: <20ms round-trip latency
**Setup**: Arturia MiniLab 3 → Windows 11 → OpenJammer → Focusrite Scarlett 4i4 → Headphones

---

## Root Cause Analysis

Based on comprehensive research across 12 research agents, the latency comes from:

| Component | Current | Optimal | Improvement |
|-----------|---------|---------|-------------|
| **Tone.js lookAhead** | 0.1s (100ms) | 0.01s (10ms) | **-90ms** |
| **AudioContext latencyHint** | 'interactive' | `0` | **-10-20ms** |
| **Chrome default** | ~67ms | ~19ms | **-48ms** |
| **MIDI input** | ~5ms | ~5ms | (already good) |
| **Focusrite 128 buffer** | ~12-15ms | ~12-15ms | (hardware limit) |

**The biggest issue**: Tone.js `lookAhead` defaults to 100ms for scheduled playback, but live performance needs near-zero lookAhead.

---

## Implementation Phases

### Phase 1: Core Audio Engine Optimization

**File**: `src/audio/AudioEngine.ts`

```typescript
// Current
audioContext = new AudioContext({
    sampleRate: config?.sampleRate || 48000,
    latencyHint: config?.lowLatencyMode ? 0.005 : 'interactive'
});

// New
audioContext = new AudioContext({
    sampleRate: config?.sampleRate || 48000,
    latencyHint: config?.lowLatencyMode ? 0 : 'interactive'  // Use 0, not 0.005
});
```

**Add Tone.js low-latency configuration**:

```typescript
export async function ensureToneStarted(): Promise<void> {
    // ... existing code ...

    if (!toneInitialized) {
        Tone.setContext(audioContext);

        // LOW LATENCY OPTIMIZATION: Reduce lookAhead from 100ms to 10ms
        Tone.context.lookAhead = 0.01;
        Tone.context.updateInterval = 0.01;

        if (Tone.context.state !== 'running') {
            await Tone.start();
        }
        toneInitialized = true;
    }
}
```

---

### Phase 2: Enhanced Latency Metrics

**File**: `src/audio/AudioEngine.ts`

```typescript
export interface LatencyMetrics {
    baseLatency: number;           // ms - processing overhead
    outputLatency: number;         // ms - output device delay
    totalLatency: number;          // ms - combined
    toneJsLookAhead: number;       // ms - Tone.js scheduling buffer
    estimatedRoundTrip: number;    // ms - total perceived latency
    classification: 'excellent' | 'good' | 'acceptable' | 'poor' | 'bad';
    isBluetoothSuspected: boolean;
}

export function getLatencyMetrics(): LatencyMetrics | null {
    if (!audioContext) return null;

    const baseLatency = audioContext.baseLatency * 1000;
    const outputLatency = (audioContext.outputLatency ?? 0) * 1000;
    const toneJsLookAhead = (cachedTone?.context?.lookAhead ?? 0.1) * 1000;
    const totalLatency = baseLatency + outputLatency;
    const estimatedRoundTrip = totalLatency * 2 + toneJsLookAhead;

    // Classify latency
    let classification: LatencyMetrics['classification'];
    if (estimatedRoundTrip <= 10) classification = 'excellent';
    else if (estimatedRoundTrip <= 20) classification = 'good';
    else if (estimatedRoundTrip <= 30) classification = 'acceptable';
    else if (estimatedRoundTrip <= 50) classification = 'poor';
    else classification = 'bad';

    return {
        baseLatency,
        outputLatency,
        totalLatency,
        toneJsLookAhead,
        estimatedRoundTrip,
        classification,
        isBluetoothSuspected: outputLatency > 100
    };
}
```

---

### Phase 3: Enhanced Audio Settings Panel UI

**File**: `src/components/Settings/AudioSettingsPanel.tsx`

Add enhanced latency visualization:

```tsx
// Latency Status Indicator
const LatencyIndicator = ({ metrics }: { metrics: LatencyMetrics }) => {
    const colors = {
        excellent: '#22c55e',  // green
        good: '#84cc16',       // lime
        acceptable: '#eab308', // yellow
        poor: '#f97316',       // orange
        bad: '#ef4444'         // red
    };

    const messages = {
        excellent: 'Perfect for real-time performance',
        good: 'Great for playing instruments',
        acceptable: 'Slight delay, but usable',
        poor: 'Noticeable delay - may affect timing',
        bad: 'High latency - not recommended for live playing'
    };

    return (
        <div className="latency-indicator">
            <div className="latency-status" style={{
                backgroundColor: colors[metrics.classification]
            }}>
                <span className="latency-value">
                    {metrics.estimatedRoundTrip.toFixed(0)}ms
                </span>
                <span className="latency-label">round-trip</span>
            </div>
            <p className="latency-message">{messages[metrics.classification]}</p>

            {metrics.isBluetoothSuspected && (
                <div className="latency-warning bluetooth">
                    <span>🎧</span>
                    <span>Bluetooth detected - use wired headphones for lower latency</span>
                </div>
            )}
        </div>
    );
};
```

Add detailed metrics breakdown:

```tsx
<div className="audio-metrics-section">
    <h3>Latency Breakdown</h3>
    <div className="metrics-detailed">
        <div className="metric-row">
            <span className="metric-name">Browser Processing</span>
            <span className="metric-value">{metrics.baseLatency.toFixed(1)}ms</span>
        </div>
        <div className="metric-row">
            <span className="metric-name">Audio Output</span>
            <span className="metric-value">{metrics.outputLatency.toFixed(1)}ms</span>
        </div>
        <div className="metric-row">
            <span className="metric-name">Tone.js Buffer</span>
            <span className="metric-value">{metrics.toneJsLookAhead.toFixed(1)}ms</span>
        </div>
        <hr />
        <div className="metric-row total">
            <span className="metric-name">Estimated Round-Trip</span>
            <span className="metric-value">{metrics.estimatedRoundTrip.toFixed(1)}ms</span>
        </div>
    </div>
</div>
```

---

### Phase 4: Smart Latency Detection & Warnings

**New File**: `src/utils/latencyDiagnostics.ts`

```typescript
export interface LatencyDiagnosis {
    issues: LatencyIssue[];
    suggestions: string[];
    showWarningBanner: boolean;
}

export interface LatencyIssue {
    severity: 'high' | 'medium' | 'low';
    issue: string;
    fix: string;
}

export function diagnoseLatency(metrics: LatencyMetrics): LatencyDiagnosis {
    const issues: LatencyIssue[] = [];
    const suggestions: string[] = [];

    // Bluetooth detection
    if (metrics.isBluetoothSuspected) {
        issues.push({
            severity: 'high',
            issue: 'Bluetooth audio adds 100-200ms delay',
            fix: 'Connect wired headphones or speakers'
        });
    }

    // High latency general
    if (metrics.classification === 'poor' || metrics.classification === 'bad') {
        issues.push({
            severity: 'high',
            issue: `Audio latency is ${metrics.estimatedRoundTrip.toFixed(0)}ms`,
            fix: 'Enable Low Latency Mode in settings'
        });

        suggestions.push('Close other audio applications');
        suggestions.push('Use Chrome with --enable-exclusive-audio flag');
    }

    // Tone.js lookAhead too high
    if (metrics.toneJsLookAhead > 50) {
        issues.push({
            severity: 'medium',
            issue: 'Audio scheduler buffer is high',
            fix: 'This should auto-fix on restart'
        });
    }

    return {
        issues,
        suggestions,
        showWarningBanner: issues.some(i => i.severity === 'high')
    };
}
```

---

### Phase 5: Warning Banner Component

**New File**: `src/components/LatencyWarningBanner.tsx`

```tsx
export function LatencyWarningBanner({ metrics }: { metrics: LatencyMetrics }) {
    const diagnosis = diagnoseLatency(metrics);
    const [dismissed, setDismissed] = useState(false);

    if (!diagnosis.showWarningBanner || dismissed) return null;

    return (
        <div className="latency-warning-banner">
            <div className="warning-icon">⚠️</div>
            <div className="warning-content">
                <strong>High Audio Latency Detected</strong>
                <p>{diagnosis.issues[0]?.issue}</p>
            </div>
            <div className="warning-actions">
                <button onClick={() => openAudioSettings()}>
                    Fix Now
                </button>
                <button onClick={() => setDismissed(true)}>
                    Dismiss
                </button>
            </div>
        </div>
    );
}
```

---

## Implementation Order

1. **Phase 1** - Core fixes (AudioEngine.ts, Tone.js config) - **Biggest impact**
2. **Phase 2** - Enhanced metrics - For debugging
3. **Phase 3** - UI improvements - Better user experience
4. **Phase 4** - Smart diagnostics - Helpful for users
5. **Phase 5** - Warning banner - Proactive guidance

---

## Expected Results

| Metric | Before | After |
|--------|--------|-------|
| Tone.js lookAhead | 100ms | 10ms |
| AudioContext latencyHint | 'interactive' (~20ms) | `0` (~10ms) |
| Total perceived latency | >50ms | **~15-20ms** |

---

## Testing Checklist

- [ ] MIDI keyboard response feels immediate
- [ ] No audio glitches or dropouts at low buffer
- [ ] Latency metrics display correctly
- [ ] Bluetooth warning appears when expected
- [ ] Low Latency Mode toggle works
- [ ] Settings persist after page reload

---

## User Documentation to Add

### Low Latency Tips for Users

1. **Use wired headphones** - Bluetooth adds 100-200ms delay
2. **Enable Low Latency Mode** in Audio Settings
3. **Close other audio apps** - Spotify, YouTube, etc.
4. **Chrome flag (advanced)**:
   - Right-click Chrome shortcut → Properties
   - Add to Target: `--enable-exclusive-audio`
5. **Audio interface** - Focusrite Scarlett at 128 buffer = ~12ms

---

## Research Sources

- Tone.js Performance Wiki: https://github.com/Tonejs/Tone.js/wiki/Performance
- MDN AudioContext: https://developer.mozilla.org/en-US/docs/Web/API/AudioContext
- Chrome Audio Latency: https://bugs.chromium.org/p/chromium/issues/detail?id=316908
- Web Audio Perf Notes: https://padenot.github.io/web-audio-perf/
- Browser Latency Measurements: https://www.jefftk.com/p/browser-audio-latency
