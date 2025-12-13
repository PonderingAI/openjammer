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

        // Connection colors
        audioOutput: string;
        audioInput: string;
        technical: string;
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
            audioOutput: '#E74C3C',
            audioInput: '#3498DB',
            technical: '#9B59B6'
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
            audioOutput: '#F97583',
            audioInput: '#79C0FF',
            technical: '#D2A8FF'
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
            audioOutput: '#FF0066',
            audioInput: '#00FFFF',
            technical: '#FF00FF'
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
            audioOutput: '#F472B6',
            audioInput: '#60A5FA',
            technical: '#A78BFA'
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

    root.style.setProperty('--audio-output', theme.colors.audioOutput);
    root.style.setProperty('--audio-input', theme.colors.audioInput);
    root.style.setProperty('--technical', theme.colors.technical);
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
