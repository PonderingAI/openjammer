/**
 * Audio Settings Panel - Configure audio latency and devices
 */

import { useState, useEffect } from 'react';
import { useAudioStore } from '../../store/audioStore';
import { reinitAudioContext, getLatencyMetrics, startLatencyMonitoring } from '../../audio/AudioEngine';
import { audioGraphManager } from '../../audio/AudioGraphManager';
import { LowLatencyGuide } from '../Guides';
import { useLowLatencyGuide } from '../../store/guideStore';
import './AudioSettingsPanel.css';

export function AudioSettingsPanel() {
    const audioConfig = useAudioStore((s) => s.audioConfig);
    const audioMetrics = useAudioStore((s) => s.audioMetrics);
    const deviceInfo = useAudioStore((s) => s.deviceInfo);
    const setAudioConfig = useAudioStore((s) => s.setAudioConfig);
    const updateAudioMetrics = useAudioStore((s) => s.updateAudioMetrics);
    const isAudioContextReady = useAudioStore((s) => s.isAudioContextReady);
    const setAudioContextReady = useAudioStore((s) => s.setAudioContextReady);

    const [pendingConfig, setPendingConfig] = useState(audioConfig);
    const [isRestarting, setIsRestarting] = useState(false);

    // Low latency guide
    const lowLatencyGuide = useLowLatencyGuide();

    // Sync pendingConfig with audioConfig when it changes externally
    useEffect(() => {
        setPendingConfig(audioConfig);
    }, [audioConfig]);

    // Monitor latency
    useEffect(() => {
        if (!isAudioContextReady) return;

        const stopMonitoring = startLatencyMonitoring((metrics) => {
            updateAudioMetrics({
                ...metrics,
                lastUpdated: Date.now()
            });
        }, 1000);

        return stopMonitoring;
    }, [updateAudioMetrics, isAudioContextReady]);

    // Apply configuration changes
    const handleApplyConfig = async () => {
        setIsRestarting(true);

        try {
            // Update store config first
            setAudioConfig(pendingConfig);

            // Mark audio context as not ready - this triggers App.tsx to dispose audioGraphManager
            setAudioContextReady(false);

            // Dispose the audio graph (clears all audio nodes)
            audioGraphManager.dispose();

            // Reinitialize audio context with new settings
            await reinitAudioContext({
                sampleRate: pendingConfig.sampleRate,
                latencyHint: pendingConfig.latencyHint,
                lowLatencyMode: pendingConfig.lowLatencyMode
            });

            // Mark audio context as ready again - this triggers App.tsx to reinitialize
            // the audioGraphManager, which will rebuild all audio connections.
            // MicrophoneNode and other components will reinitialize with new settings.
            setAudioContextReady(true);

            // Update metrics
            const metrics = getLatencyMetrics();
            if (metrics) {
                updateAudioMetrics({
                    ...metrics,
                    lastUpdated: Date.now()
                });
            }
        } catch (err) {
            console.error('Failed to apply audio config:', err);
            alert('Failed to apply audio settings. Please try again.');
            // Try to restore audio context ready state on error
            setAudioContextReady(true);
        } finally {
            setIsRestarting(false);
        }
    };

    const hasChanges = JSON.stringify(pendingConfig) !== JSON.stringify(audioConfig);

    return (
        <div className="audio-settings-panel">
            {/* Low Latency Setup Guide Button */}
            <button
                className="guide-launch-btn"
                onClick={lowLatencyGuide.open}
            >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
                </svg>
                Low Latency Setup Guide
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="arrow-icon">
                    <polyline points="9 18 15 12 9 6" />
                </svg>
            </button>

            {/* Low Latency Guide Modal */}
            <LowLatencyGuide />

            {/* USB Audio Interface Detection */}
            {deviceInfo.isUSBAudioInterface && (
                <div className="audio-info-banner usb-detected">
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
                        <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                    </svg>
                    <div>
                        <strong>USB Audio Interface Detected</strong>
                        <p>{deviceInfo.deviceLabel}</p>
                        <p className="suggestion">Enable Low Latency Mode for best performance</p>
                    </div>
                </div>
            )}

            {/* Latency Metrics */}
            {isAudioContextReady && (
                <div className="audio-metrics-section">
                    <h3>Current Latency</h3>
                    <div className="metrics-grid">
                        <div className="metric-card">
                            <span className="metric-label">Base Latency</span>
                            <span className="metric-value">
                                {audioMetrics.baseLatency.toFixed(1)} ms
                            </span>
                        </div>
                        <div className="metric-card">
                            <span className="metric-label">Output Latency</span>
                            <span className="metric-value">
                                {audioMetrics.outputLatency.toFixed(1)} ms
                            </span>
                        </div>
                        <div className="metric-card total">
                            <span className="metric-label">Total Latency</span>
                            <span className="metric-value">
                                {audioMetrics.totalLatency.toFixed(1)} ms
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Audio Configuration */}
            <div className="audio-config-section">
                <h3>Audio Configuration</h3>

                {/* Sample Rate */}
                <div className="setting-group">
                    <label>Sample Rate</label>
                    <select
                        value={pendingConfig.sampleRate}
                        onChange={(e) => setPendingConfig({
                            ...pendingConfig,
                            sampleRate: Number(e.target.value)
                        })}
                    >
                        <option value={44100}>44.1 kHz (CD Quality)</option>
                        <option value={48000}>48 kHz (Recommended)</option>
                        <option value={96000}>96 kHz (High Quality)</option>
                    </select>
                    <p className="setting-description">
                        Higher sample rates provide better audio quality but increase CPU usage.
                    </p>
                </div>

                {/* Latency Hint */}
                <div className="setting-group">
                    <label>Latency Mode</label>
                    <select
                        value={pendingConfig.latencyHint}
                        onChange={(e) => setPendingConfig({
                            ...pendingConfig,
                            latencyHint: e.target.value as AudioContextLatencyCategory
                        })}
                    >
                        <option value="interactive">Interactive (Lowest Latency)</option>
                        <option value="balanced">Balanced</option>
                        <option value="playback">Playback (Highest Quality)</option>
                    </select>
                    <p className="setting-description">
                        Interactive mode minimizes latency for live performance.
                    </p>
                </div>

                {/* Low Latency Mode Toggle */}
                <div className="setting-group">
                    <label className="toggle-label">
                        <input
                            type="checkbox"
                            checked={pendingConfig.lowLatencyMode}
                            onChange={(e) => setPendingConfig({
                                ...pendingConfig,
                                lowLatencyMode: e.target.checked
                            })}
                        />
                        <span>Low Latency Mode</span>
                    </label>
                    <p className="setting-description">
                        Disables echo cancellation, noise suppression, and auto gain control
                        for microphone input. Reduces latency by 20-50ms.
                        <strong>Recommended with USB audio interfaces.</strong>
                    </p>
                </div>

                {/* Apply Button */}
                {hasChanges && (
                    <button
                        className="apply-config-btn"
                        onClick={handleApplyConfig}
                        disabled={isRestarting}
                    >
                        {isRestarting ? 'Restarting Audio...' : 'Apply Changes'}
                    </button>
                )}
            </div>

            {/* Browser Support Info */}
            <div className="audio-info-section">
                <h3>Browser Audio System</h3>
                <ul className="info-list">
                    <li>
                        <strong>Windows:</strong> Uses WASAPI (10-30ms latency)
                    </li>
                    <li>
                        <strong>macOS:</strong> Uses Core Audio (3-5ms latency)
                    </li>
                    <li>
                        <strong>Note:</strong> ASIO drivers are not accessible from browsers.
                        Use a USB audio interface for lowest latency.
                    </li>
                </ul>
            </div>
        </div>
    );
}
