import { getItem, setItem, removeItem } from '@/lib/storage';

const STORAGE_KEY = 'onboarding_completed_step';

/**
 * Ordered onboarding route segments. Index determines prerequisite order:
 * a user can only visit step N if steps 0..N-1 are completed.
 */
export const ONBOARDING_STEPS = [
  'welcome',
  'features',
  'signup',
  'permissions',
  'phone',
  'connect',
  'done',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** Returns the index of the highest completed step, or -1 if none. */
export function getCompletedStepIndex(): number {
  return getItem<number>(STORAGE_KEY) ?? -1;
}

/** Mark a step (and all prior steps) as completed. */
export function completeOnboardingStep(step: OnboardingStep): void {
  const idx = ONBOARDING_STEPS.indexOf(step);
  if (idx < 0) return;
  const current = getCompletedStepIndex();
  if (idx > current) {
    setItem(STORAGE_KEY, idx);
  }
}

/** Clear onboarding progress (called when onboarding finishes). */
export function clearOnboardingProgress(): void {
  removeItem(STORAGE_KEY);
}

/**
 * Given a route segment, returns the segment the user should be on
 * if they haven't completed the prerequisites, or null if access is allowed.
 */
export function getRequiredRedirect(segment: string): string | null {
  const targetIdx = ONBOARDING_STEPS.indexOf(segment as OnboardingStep);
  if (targetIdx <= 0) return null; // welcome (or unknown) is always accessible
  const completed = getCompletedStepIndex();
  if (targetIdx <= completed + 1) return null; // prerequisite met
  // Redirect to the next step they should complete
  return ONBOARDING_STEPS[completed + 1] ?? 'welcome';
}
