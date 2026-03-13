import { getToken } from './auth';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

async function req<T>(method: string, path: string, body?: object): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

export const api = {
  auth: {
    requestOtp: (phone: string) =>
      req<{ ok: boolean }>('POST', '/auth/request-otp', { phone }),
    verifyOtp: (phone: string, code: string) =>
      req<{ token: string }>('POST', '/auth/verify-otp', { phone, code }),
    setPin: (pin: string) =>
      req<{ ok: boolean }>('POST', '/auth/set-pin', { pin }),
    google: (idToken: string) =>
      req<{ token: string }>('POST', '/auth/google', { idToken }),
  },
  chat: (message: string) =>
    req<{ reply: string }>('POST', '/api/chat', { message }),
  apps: () =>
    req<{ connected: string[]; missing: string[] }>('GET', '/api/apps'),
  workflows: {
    list: () => req<{ workflows: import('./types').Workflow[] }>('GET', '/api/workflows'),
    create: (w: object) => req<{ workflow: import('./types').Workflow }>('POST', '/api/workflows', w),
    update: (id: string, patch: object) =>
      req<{ workflow: import('./types').Workflow }>('PATCH', `/api/workflows/${id}`, patch),
  },
  notify: {
    register: (token: string) =>
      req<{ ok: boolean }>('POST', '/api/notify/register', { token }),
  },
  user: {
    updatePreferences: (prefs: object) =>
      req<{ user: import('./types').User }>('PATCH', '/api/user/preferences', prefs),
  },
};
