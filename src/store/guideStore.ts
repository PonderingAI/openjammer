import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { StepStatus } from '../components/Guides/GuideStep';

// ============================================
// Types
// ============================================

export interface StepState {
  status: StepStatus;
  completedAt?: number;
  testResult?: 'success' | 'failure' | 'warning';
  data?: Record<string, unknown>;
}

export interface GuideState {
  // Currently open guide
  activeGuide: string | null;

  // Step states per guide: { guideId: { stepId: StepState } }
  stepStates: Record<string, Record<string, StepState>>;

  // Actions
  openGuide: (guideId: string) => void;
  closeGuide: () => void;

  // Step management
  setStepStatus: (guideId: string, stepId: string, status: StepStatus) => void;
  setStepTestResult: (
    guideId: string,
    stepId: string,
    result: 'success' | 'failure' | 'warning'
  ) => void;
  setStepData: (
    guideId: string,
    stepId: string,
    data: Record<string, unknown>
  ) => void;
  markStepCompleted: (guideId: string, stepId: string) => void;
  resetGuide: (guideId: string) => void;

  // Computed helpers
  getStepState: (guideId: string, stepId: string) => StepState | undefined;
  getCompletedSteps: (guideId: string) => string[];
  getPendingSteps: (guideId: string, allStepIds: string[]) => string[];
  isStepCompleted: (guideId: string, stepId: string) => boolean;
}

// ============================================
// Default step state
// ============================================

const defaultStepState: StepState = {
  status: 'pending',
};

// ============================================
// Store
// ============================================

export const useGuideStore = create<GuideState>()(
  persist(
    (set, get) => ({
      // State
      activeGuide: null,
      stepStates: {},

      // Actions
      openGuide: (guideId: string) => {
        set({ activeGuide: guideId });
      },

      closeGuide: () => {
        set({ activeGuide: null });
      },

      setStepStatus: (guideId: string, stepId: string, status: StepStatus) => {
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [guideId]: {
              ...state.stepStates[guideId],
              [stepId]: {
                ...state.stepStates[guideId]?.[stepId],
                status,
                ...(status === 'completed' ? { completedAt: Date.now() } : {}),
              },
            },
          },
        }));
      },

      setStepTestResult: (
        guideId: string,
        stepId: string,
        result: 'success' | 'failure' | 'warning'
      ) => {
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [guideId]: {
              ...state.stepStates[guideId],
              [stepId]: {
                ...state.stepStates[guideId]?.[stepId],
                testResult: result,
              },
            },
          },
        }));
      },

      setStepData: (
        guideId: string,
        stepId: string,
        data: Record<string, unknown>
      ) => {
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [guideId]: {
              ...state.stepStates[guideId],
              [stepId]: {
                ...state.stepStates[guideId]?.[stepId],
                data: {
                  ...state.stepStates[guideId]?.[stepId]?.data,
                  ...data,
                },
              },
            },
          },
        }));
      },

      markStepCompleted: (guideId: string, stepId: string) => {
        set((state) => ({
          stepStates: {
            ...state.stepStates,
            [guideId]: {
              ...state.stepStates[guideId],
              [stepId]: {
                ...state.stepStates[guideId]?.[stepId],
                status: 'completed',
                completedAt: Date.now(),
              },
            },
          },
        }));
      },

      resetGuide: (guideId: string) => {
        set((state) => {
          const newStepStates = { ...state.stepStates };
          delete newStepStates[guideId];
          return { stepStates: newStepStates };
        });
      },

      // Computed helpers
      getStepState: (guideId: string, stepId: string) => {
        const state = get();
        return state.stepStates[guideId]?.[stepId] || defaultStepState;
      },

      getCompletedSteps: (guideId: string) => {
        const state = get();
        const guideSteps = state.stepStates[guideId] || {};
        return Object.entries(guideSteps)
          .filter(([_, stepState]) => stepState.status === 'completed')
          .map(([stepId]) => stepId);
      },

      getPendingSteps: (guideId: string, allStepIds: string[]) => {
        const state = get();
        const completedSteps = state.getCompletedSteps(guideId);
        return allStepIds.filter((id) => !completedSteps.includes(id));
      },

      isStepCompleted: (guideId: string, stepId: string) => {
        const state = get();
        return state.stepStates[guideId]?.[stepId]?.status === 'completed';
      },
    }),
    {
      name: 'openjammer-guides',
      partialize: (state) => ({
        // Only persist stepStates, not activeGuide
        stepStates: state.stepStates,
      }),
    }
  )
);

// ============================================
// Selector hooks for convenience
// ============================================

export const useLowLatencyGuide = () => {
  const guideId = 'low-latency-setup';

  const store = useGuideStore();

  return {
    isOpen: store.activeGuide === guideId,
    open: () => store.openGuide(guideId),
    close: () => store.closeGuide(),
    reset: () => store.resetGuide(guideId),
    getStepState: (stepId: string) => store.getStepState(guideId, stepId),
    setStepStatus: (stepId: string, status: StepStatus) =>
      store.setStepStatus(guideId, stepId, status),
    markStepCompleted: (stepId: string) =>
      store.markStepCompleted(guideId, stepId),
    setStepTestResult: (
      stepId: string,
      result: 'success' | 'failure' | 'warning'
    ) => store.setStepTestResult(guideId, stepId, result),
    setStepData: (stepId: string, data: Record<string, unknown>) =>
      store.setStepData(guideId, stepId, data),
    getCompletedSteps: () => store.getCompletedSteps(guideId),
    getPendingSteps: (allStepIds: string[]) =>
      store.getPendingSteps(guideId, allStepIds),
    isStepCompleted: (stepId: string) => store.isStepCompleted(guideId, stepId),
  };
};
