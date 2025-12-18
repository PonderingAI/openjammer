/**
 * Theme System - Multiple color themes with persistence
 */

export interface Theme {
    id: string;
    name: string;
    colors: {
        // Background colors
        bgPrimary: string;
        bgSecondary: string;
        bgNode: string;
        bgTertiary: string;

        // Text colors
        textPrimary: string;
        textSecondary: string;
        textMuted: string;

        // Border colors
        borderSubtle: string;
        borderStrong: string;

        // Accent colors
        accentPrimary: string;
        accentSecondary: string;
        accentSuccess: string;
        accentWarning: string;
        accentDanger: string;

        // Audio connections (Blue, Directional)
        audioInput: string;       // Light blue - audio input ports
        audioOutput: string;      // Dark blue - audio output ports
        audioConnection: string;  // Medium blue - audio connection lines
        audioConnected: string;   // Bright blue - connected audio ports

        // Technical connections (Grey, Bidirectional)
        technicalInput: string;      // Dark grey - technical input ports
        technicalOutput: string;     // Light grey - technical output ports
        technicalConnection: string; // Medium grey - technical connection lines
        technicalConnected: string;  // Grey - connected technical ports
    };
}

export const themes: Theme[] = [
    {
        id: 'cream',
        name: 'Cream (Lycatra)',
        colors: {
            bgPrimary: '#F5F0E8',
            bgSecondary: '#EDE8DF',
            bgNode: '#FFFFFF',
            bgTertiary: '#E8E3DA',
            textPrimary: '#1A1A1A',
            textSecondary: '#4A4A4A',
            textMuted: '#8A8A8A',
            borderSubtle: '#D4CFC6',
            borderStrong: '#1A1A1A',
            accentPrimary: '#1A1A1A',
            accentSecondary: '#6B5B4F',
            accentSuccess: '#4A7C59',
            accentWarning: '#C68B3F',
            accentDanger: '#A65353',
            audioInput: '#7EB3D8',
            audioOutput: '#2C5F88',
            audioConnection: '#4A90C2',
            audioConnected: '#5B9FD4',
            technicalInput: '#606060',
            technicalOutput: '#A0A0A0',
            technicalConnection: '#808080',
            technicalConnected: '#909090'
        }
    },
    {
        id: 'dark',
        name: 'Dark Mode',
        colors: {
            bgPrimary: '#0D1117',
            bgSecondary: '#161B22',
            bgNode: '#21262D',
            bgTertiary: '#30363D',
            textPrimary: '#F0F6FC',
            textSecondary: '#C9D1D9',
            textMuted: '#8B949E',
            borderSubtle: '#30363D',
            borderStrong: '#F0F6FC',
            accentPrimary: '#58A6FF',
            accentSecondary: '#8B5CF6',
            accentSuccess: '#3FB950',
            accentWarning: '#D29922',
            accentDanger: '#F85149',
            audioInput: '#79C0FF',
            audioOutput: '#3B6FA5',
            audioConnection: '#58A6FF',
            audioConnected: '#6CB6FF',
            technicalInput: '#505050',
            technicalOutput: '#909090',
            technicalConnection: '#707070',
            technicalConnected: '#808080'
        }
    },
    {
        id: 'cyberpunk',
        name: 'Cyberpunk',
        colors: {
            bgPrimary: '#0A0A0F',
            bgSecondary: '#12121A',
            bgNode: '#1A1A25',
            bgTertiary: '#252532',
            textPrimary: '#00FFFF',
            textSecondary: '#FF00FF',
            textMuted: '#666680',
            borderSubtle: '#333345',
            borderStrong: '#00FFFF',
            accentPrimary: '#FF00FF',
            accentSecondary: '#00FFFF',
            accentSuccess: '#00FF88',
            accentWarning: '#FFFF00',
            accentDanger: '#FF0066',
            audioInput: '#00FFFF',
            audioOutput: '#0088AA',
            audioConnection: '#00CCDD',
            audioConnected: '#00EEFF',
            technicalInput: '#444455',
            technicalOutput: '#8888AA',
            technicalConnection: '#666688',
            technicalConnected: '#7777AA'
        }
    },
    {
        id: 'midnight',
        name: 'Midnight Blue',
        colors: {
            bgPrimary: '#0F172A',
            bgSecondary: '#1E293B',
            bgNode: '#334155',
            bgTertiary: '#475569',
            textPrimary: '#F8FAFC',
            textSecondary: '#CBD5E1',
            textMuted: '#94A3B8',
            borderSubtle: '#475569',
            borderStrong: '#F8FAFC',
            accentPrimary: '#3B82F6',
            accentSecondary: '#8B5CF6',
            accentSuccess: '#22C55E',
            accentWarning: '#F59E0B',
            accentDanger: '#EF4444',
            audioInput: '#93C5FD',
            audioOutput: '#3B82F6',
            audioConnection: '#60A5FA',
            audioConnected: '#7DB8FF',
            technicalInput: '#475569',
            technicalOutput: '#94A3B8',
            technicalConnection: '#64748B',
            technicalConnected: '#78859B'
        }
    }
];

export function applyTheme(theme: Theme): void {
    const root = document.documentElement;

    root.style.setProperty('--bg-primary', theme.colors.bgPrimary);
    root.style.setProperty('--bg-secondary', theme.colors.bgSecondary);
    root.style.setProperty('--bg-node', theme.colors.bgNode);
    root.style.setProperty('--bg-tertiary', theme.colors.bgTertiary);

    root.style.setProperty('--text-primary', theme.colors.textPrimary);
    root.style.setProperty('--text-secondary', theme.colors.textSecondary);
    root.style.setProperty('--text-muted', theme.colors.textMuted);

    root.style.setProperty('--border-subtle', theme.colors.borderSubtle);
    root.style.setProperty('--border-strong', theme.colors.borderStrong);

    root.style.setProperty('--accent-primary', theme.colors.accentPrimary);
    root.style.setProperty('--accent-secondary', theme.colors.accentSecondary);
    root.style.setProperty('--accent-success', theme.colors.accentSuccess);
    root.style.setProperty('--accent-warning', theme.colors.accentWarning);
    root.style.setProperty('--accent-danger', theme.colors.accentDanger);

    root.style.setProperty('--audio-input', theme.colors.audioInput);
    root.style.setProperty('--audio-output', theme.colors.audioOutput);
    root.style.setProperty('--audio-connection', theme.colors.audioConnection);
    root.style.setProperty('--audio-connected', theme.colors.audioConnected);
    root.style.setProperty('--technical-input', theme.colors.technicalInput);
    root.style.setProperty('--technical-output', theme.colors.technicalOutput);
    root.style.setProperty('--technical-connection', theme.colors.technicalConnection);
    root.style.setProperty('--technical-connected', theme.colors.technicalConnected);
}

export function getThemeById(id: string): Theme | undefined {
    return themes.find(t => t.id === id);
}

export function getSavedThemeId(): string {
    return localStorage.getItem('openjammer-theme') || 'cream';
}

export function saveThemeId(id: string): void {
    localStorage.setItem('openjammer-theme', id);
}
