import { useEffect } from 'react';
import { Stack, usePathname, useRouter } from 'expo-router';
import { getRequiredRedirect } from '@/lib/onboarding-steps';

export default function OnboardingLayout() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    const segment = pathname.split('/').pop() || 'welcome';
    const redirect = getRequiredRedirect(segment);
    if (redirect) {
      router.replace(`/onboarding/${redirect}`);
    }
  }, [pathname, router]);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }} />
  );
}
