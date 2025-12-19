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
        bgCanvas: string;          // Main canvas background
        bgCanvasAlt: string;       // Alternative canvas shade
        bgNodeHeader: string;      // Node header background

        // Text colors
        textPrimary: string;
        textSecondary: string;
        textMuted: string;
        textOnAccent: string;      // Text color on primary/success/warning buttons

        // Border colors
        borderSubtle: string;
        borderStrong: string;
        borderSketch: string;      // Primary border color for sketch elements

        // Sketch/Drawing colors
        sketchBlack: string;       // Primary lines/borders
        sketchGray: string;        // Secondary lines
        sketchLight: string;       // Subtle lines

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
        name: 'Cream',
        colors: {
            bgPrimary: '#F5F0E8',
            bgSecondary: '#EDE8DF',
            bgNode: '#FFFFFF',
            bgTertiary: '#E8E3DA',
            bgCanvas: '#F5F0E8',
            bgCanvasAlt: '#EDE8E0',
            bgNodeHeader: '#EDE8E0',
            textPrimary: '#1A1A1A',
            textSecondary: '#4A4A4A',
            textMuted: '#8A8A8A',
            textOnAccent: '#FFFFFF',
            borderSubtle: '#D4CFC6',
            borderStrong: '#1A1A1A',
            borderSketch: '#1A1A1A',
            sketchBlack: '#1A1A1A',
            sketchGray: '#4A4A4A',
            sketchLight: '#8A8A8A',
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
        id: 'cyberpunk',
        name: 'Cyberpunk',
        colors: {
            bgPrimary: '#0A0A0F',
            bgSecondary: '#12121A',
            bgNode: '#12121A',
            bgTertiary: '#252532',
            bgCanvas: '#0A0A0F',
            bgCanvasAlt: '#12121A',
            bgNodeHeader: '#12121A',
            textPrimary: '#00FFFF',
            textSecondary: '#FF00FF',
            textMuted: '#666680',
            textOnAccent: '#0A0A0F',
            borderSubtle: '#333345',
            borderStrong: '#00FFFF',
            borderSketch: '#00FFFF',
            sketchBlack: '#00FFFF',
            sketchGray: '#666680',
            sketchLight: '#333345',
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
            bgNode: '#1E293B',
            bgTertiary: '#475569',
            bgCanvas: '#0F172A',
            bgCanvasAlt: '#1E293B',
            bgNodeHeader: '#1E293B',
            textPrimary: '#F8FAFC',
            textSecondary: '#CBD5E1',
            textMuted: '#94A3B8',
            textOnAccent: '#FFFFFF',
            borderSubtle: '#475569',
            borderStrong: '#F8FAFC',
            borderSketch: '#F8FAFC',
            sketchBlack: '#F8FAFC',
            sketchGray: '#94A3B8',
            sketchLight: '#475569',
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
    root.style.setProperty('--bg-canvas', theme.colors.bgCanvas);
    root.style.setProperty('--bg-canvas-alt', theme.colors.bgCanvasAlt);
    root.style.setProperty('--bg-node-header', theme.colors.bgNodeHeader);

    root.style.setProperty('--text-primary', theme.colors.textPrimary);
    root.style.setProperty('--text-secondary', theme.colors.textSecondary);
    root.style.setProperty('--text-muted', theme.colors.textMuted);
    root.style.setProperty('--text-on-accent', theme.colors.textOnAccent);

    root.style.setProperty('--border-subtle', theme.colors.borderSubtle);
    root.style.setProperty('--border-strong', theme.colors.borderStrong);
    root.style.setProperty('--border-sketch', theme.colors.borderSketch);

    root.style.setProperty('--sketch-black', theme.colors.sketchBlack);
    root.style.setProperty('--sketch-gray', theme.colors.sketchGray);
    root.style.setProperty('--sketch-light', theme.colors.sketchLight);

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
    try {
        const savedId = localStorage.getItem('openjammer-theme');
        // Validate the saved theme ID exists
        if (savedId && themes.some(t => t.id === savedId)) {
            return savedId;
        }
        return 'cream';
    } catch (error) {
        console.error('Failed to read theme from localStorage:', error);
        return 'cream';
    }
}

export function saveThemeId(id: string): void {
    try {
        // Validate the theme ID exists before saving
        if (!themes.some(t => t.id === id)) {
            console.warn(`Invalid theme ID: ${id}, not saving`);
            return;
        }
        localStorage.setItem('openjammer-theme', id);
    } catch (error) {
        console.error('Failed to save theme to localStorage:', error);
    }
}
