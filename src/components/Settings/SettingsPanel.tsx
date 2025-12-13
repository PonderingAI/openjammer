/**
 * Settings Panel - Cyberpunk 2077 inspired settings menu
 */

import { useState } from 'react';
import { themes, applyTheme, getThemeById, getSavedThemeId, saveThemeId } from '../../styles/themes';
import './SettingsPanel.css';

export function SettingsPanel({ onClose }: { onClose: () => void }) {
    const [activeTab, setActiveTab] = useState('graphics'); // 'graphics' (themes) | 'audio' | 'gameplay'
    const [selectedTheme, setSelectedTheme] = useState(getSavedThemeId());

    const handleThemeChange = (themeId: string) => {
        setSelectedTheme(themeId);
        const theme = getThemeById(themeId);
        if (theme) {
            applyTheme(theme);
            saveThemeId(themeId);
        }
    };

    return (
        <div className="settings-overlay">
            <div className="settings-container">
                <div className="settings-header">
                    <h2>SETTINGS</h2>
                    <div className="settings-breadcrumbs">
                        <span>SETTINGS</span>
                        <span className="separator">/</span>
                        <span>{activeTab.toUpperCase()}</span>
                    </div>
                </div>

                <div className="settings-content">
                    {/* Sidebar */}
                    <div className="settings-sidebar">
                        {['graphics', 'audio', 'gameplay', 'interface', 'accessibility'].map(tab => (
                            <button
                                key={tab}
                                className={`settings-tab-btn ${activeTab === tab ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab)}
                            >
                                {tab.toUpperCase()}
                            </button>
                        ))}
                    </div>

                    {/* Main Content */}
                    <div className="settings-main">
                        {activeTab === 'graphics' && (
                            <div className="settings-section">
                                <h3>INTERFACE THEME</h3>
                                <div className="theme-grid">
                                    {themes.map(theme => (
                                        <div
                                            key={theme.id}
                                            className={`theme-card ${selectedTheme === theme.id ? 'active' : ''}`}
                                            onClick={() => handleThemeChange(theme.id)}
                                        >
                                            <div
                                                className="theme-preview"
                                                style={{ background: theme.colors.bgPrimary }}
                                            >
                                                <div className="theme-preview-node" style={{ background: theme.colors.bgNode }} />
                                            </div>
                                            <div className="theme-name">{theme.name}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Placeholders for other tabs */}
                        {activeTab !== 'graphics' && (
                            <div className="settings-placeholder">
                                SECTION UNDER CONSTRUCTION
                            </div>
                        )}
                    </div>
                </div>

                <div className="settings-footer">
                    <button className="settings-close-btn" onClick={onClose}>
                        CLOSE [ESC]
                    </button>
                </div>
            </div>
        </div>
    );
}
