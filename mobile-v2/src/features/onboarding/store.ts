import { create } from 'zustand';
import { createSelectors } from '@/lib/utils';
import { getItem, setItem } from '@/lib/storage';

type OnboardingState = {
  step: number;
  phone: string;
  connectedApps: string[];
  permissions: {
    notifications: boolean;
    contacts: boolean;
    calendar: boolean;
    location: boolean;
  };
  setStep: (step: number) => void;
  setPhone: (phone: string) => void;
  addConnectedApp: (slug: string) => void;
  setPermission: (key: keyof OnboardingState['permissions'], value: boolean) => void;
  hydrate: () => void;
  persist: () => void;
};

const _useOnboardingStore = create<OnboardingState>((set, get) => ({
  step: 1,
  phone: '',
  connectedApps: [],
  permissions: {
    notifications: false,
    contacts: false,
    calendar: false,
    location: false,
  },
  setStep: (step) => {
    set({ step });
    get().persist();
  },
  setPhone: (phone) => {
    set({ phone });
    get().persist();
  },
  addConnectedApp: (slug) => {
    set((state) => ({ connectedApps: [...state.connectedApps, slug] }));
    get().persist();
  },
  setPermission: (key, value) => {
    set((state) => ({
      permissions: { ...state.permissions, [key]: value },
    }));
    get().persist();
  },
  hydrate: () => {
    const saved = getItem<Partial<OnboardingState>>('onboarding_state');
    if (saved) {
      set({
        step: saved.step ?? 1,
        phone: saved.phone ?? '',
        connectedApps: saved.connectedApps ?? [],
        permissions: saved.permissions ?? {
          notifications: false,
          contacts: false,
          calendar: false,
          location: false,
        },
      });
    }
  },
  persist: () => {
    const state = get();
    setItem('onboarding_state', {
      step: state.step,
      phone: state.phone,
      connectedApps: state.connectedApps,
      permissions: state.permissions,
    });
  },
}));

export const useOnboardingStore = createSelectors(_useOnboardingStore);
