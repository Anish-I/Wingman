import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import { isAuthenticated } from '../src/auth';

export default function Index() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    isAuthenticated().then(setAuthed);
  }, []);

  if (authed === null) return null;
  if (authed) return <Redirect href="/(tabs)/chat" />;
  return <Redirect href="/onboarding/" />;
}
