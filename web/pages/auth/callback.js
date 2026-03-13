import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!router.isReady) return;

    const code = router.query.code;
    if (!code) {
      setError('No authorization code received.');
      return;
    }

    async function exchangeCode() {
      try {
        const res = await fetch(`${API_URL}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken: code,
            redirect_uri: `${window.location.origin}/auth/callback`,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Authentication failed');
        localStorage.setItem('wingman_token', data.token);
        router.push('/chat');
      } catch (err) {
        setError(err.message);
      }
    }

    exchangeCode();
  }, [router.isReady, router.query.code]);

  if (error) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-surface border border-border rounded-2xl p-8 text-center">
          <div className="text-red-400 text-lg font-semibold mb-2">Sign-in failed</div>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <button
            onClick={() => router.push('/login')}
            className="px-6 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white font-medium transition-colors"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-gray-400">Signing you in...</p>
      </div>
    </div>
  );
}
