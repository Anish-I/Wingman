import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getToken } from './auth';

export function useRequireAuth() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace('/login');
    } else {
      setChecked(true);
    }
  }, []);

  return checked;
}
