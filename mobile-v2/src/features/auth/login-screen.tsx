import type { LoginFormProps } from './components/login-form';
import { useRouter } from 'expo-router';

import * as React from 'react';
import { FocusAwareStatusBar } from '@/components/ui';
import { LoginForm } from './components/login-form';
import { useAuthStore } from './use-auth-store';

export function LoginScreen() {
  const router = useRouter();
  const signIn = useAuthStore.use.signIn();

  const onSubmit: LoginFormProps['onSubmit'] = (_data) => {
    // This legacy login form is not connected to a real auth flow.
    // Users should use the /login route (OTP-based) or /onboarding/signup instead.
    router.replace('/login');
  };

  return (
    <>
      <FocusAwareStatusBar />
      <LoginForm onSubmit={onSubmit} />
    </>
  );
}
