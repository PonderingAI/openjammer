# PR Polish Plan - MIDI + Files Branch

## Overview
Comprehensive code review findings from 8 specialized review agents (2 waves), with fixes prioritized for PR readiness.

**Build Status:** PASSING
**Security Status:** GOOD (excellent path traversal protection, no XSS)

---

## Implementation Status

### Critical Issues - ALL FIXED

| # | Issue | Status |
|---|-------|--------|
| 1 | MIDI store memory leaks (midiStore.ts) | FIXED |
| 2 | MediaRecorder error handlers (Recorder.ts, Looper.ts) | FIXED |
| 3 | MediaStream track cleanup (Recorder.ts) | FIXED |
| 4 | AudioContext reuse (WavEncoder.ts) | FIXED |
| 5 | setTimeout cleanup pattern (3 node files) | FIXED |

### High Priority Issues - ALL FIXED

| # | Issue | Status |
|---|-------|--------|
| 6 | Console.log statements removed | FIXED |
| 7 | BundlePortGroup state sync | FIXED |
| 8 | graphStore double history push | FIXED |
| 9 | Looper MIME type fallback | FIXED |
| 10 | MIDI auto-reconnect optimization | FIXED |
| 11 | Type guards for node data | FIXED |
| 12 | Audio failure user notifications | FIXED |
| 13 | KeyboardVisualNode store subscription | FIXED |

### Medium Priority Issues - MOSTLY FIXED

| # | Issue | Status |
|---|-------|--------|
| 14 | Stale Closure in MiniLab3Visual | Deferred - requires significant refactor |
| 15 | Handle cleanup in sampleLibraryStore | FIXED |
| 16 | Direct Object Mutation in graphStore | Skipped - not a bug (objects are fresh) |
| 17 | Unsafe Type Casts in Panel Nodes | FIXED (handleLabelClick) |
| 18 | Blob URL Revocation Timing | Previously fixed |
| 19 | LooperNode Effect Split | Deferred - minor optimization |
| 20 | Fire-and-Forget Async Calls | FIXED |
| 21 | relinkSample Error Handling | FIXED |

### Low Priority Issues - DEFERRED

| # | Issue | Status |
|---|-------|--------|
| 22-26 | Accessibility, Code Cleanup, Type Safety, Performance, Docs | Deferred to future PR |

---

## Fixes Applied

### Critical Fixes

1. **midiStore.ts** - Memory leak prevention
   - Store cleanup functions from device listeners in state
   - Clean existing subscriptions before adding new ones
   - Proper cleanup in `cleanup()` method

2. **Recorder.ts** - Recording reliability
   - Added `onerror` handler on MediaRecorder
   - Fixed MediaStream track cleanup in `disconnect()`
   - Fixed blob URL revocation timing (100ms delay)

3. **Looper.ts** - Browser compatibility
   - Added `onerror` handler on MediaRecorder
   - Added MIME type fallback for browsers without opus

4. **WavEncoder.ts** - Resource management
   - Reuse AudioContext from AudioEngine instead of creating new

5. **SpeakerNode.tsx, MicrophoneNode.tsx, InstrumentNode.tsx** - React cleanup
   - Store setTimeout ID and clearTimeout in cleanup

### High Priority Fixes

6. **Console.log removal** - Cleaner production code
   - Removed from App.tsx, MIDIIntegration.tsx, usePWA.ts

7. **BundlePortGroup.tsx** - State sync
   - Added useEffect to sync local state with prop changes

8. **graphStore.ts** - Undo/Redo fix
   - Fixed double history push when replacing audio connections
   - Inline removal instead of calling removeConnection()

9. **Looper.ts** - Already fixed in #3

10. **MIDIIntegration.tsx** - Performance optimization
    - Removed `nodes` from effect dependencies
    - Use `useGraphStore.getState()` for one-time read
    - Track reconnected nodes in ref

11. **MIDIIntegration.tsx** - Type safety
    - Added type guard: `if (node.type !== 'midi' && node.type !== 'minilab-3') continue`

12. **AudioGraphManager.ts** - User feedback
    - Added toast notifications for audio playback failures
    - Added toast for output device switching failures

13. **KeyboardVisualNode.tsx** - React correctness
    - Subscribe to `controlDown` from store instead of imperative read

### Medium Priority Fixes

15. **sampleLibraryStore.ts** - Resource cleanup
    - Clean up sample handles when removing library

17. **InputPanelNode.tsx, OutputPanelNode.tsx** - Type safety
    - Fixed `handleLabelClick` to accept `MouseEvent | KeyboardEvent`
    - Removed unsafe type casts

20. **projectStore.ts** - Error handling
    - Added `.catch()` handlers to fire-and-forget async calls

21. **sampleLibraryStore.ts** - Error handling
    - Added try-catch to `relinkSample`
    - Mark sample as missing on error

---

## Security Notes (Already Good)

- Path traversal protection: Excellent with double-encoding detection
- XSS: All user input rendered through React JSX (auto-escaped)
- Resource limits: Properly implemented (MAX_RECORDINGS, MAX_SEARCH_DEPTH, etc.)
- No eval() or new Function() usage
- Proper mutex for file operations

---

## What Remains (Optional for Future PRs)

### Low Priority
- Accessibility improvements (keyboard navigation for ports)
- Code cleanup (unused handlers, duplicate exports)
- Performance optimizations (useMemo for computed values)
- Documentation updates

### Known Limitations
- Port keyboard accessibility (`handlePortMouseDown`) requires mouse event - proper fix needs architecture change
- Stale closure in MiniLab3Visual callbacks - would need ref-based pattern

---

## Summary

| Category | Total | Fixed | Deferred |
|----------|-------|-------|----------|
| Critical | 5 | 5 | 0 |
| High Priority | 8 | 8 | 0 |
| Medium Priority | 8 | 5 | 3 |
| Low Priority | 5 | 0 | 5 |
| **Total** | **26** | **18** | **8** |

**All critical and high priority issues are fixed. Build passes, security is solid, PR is ready for review.**
