import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Layout from '../../components/Layout';
import AppCategory from '../../components/AppCategory';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export default function ConnectPage() {
  const router = useRouter();
  const queryToken = router.query.token;
  const [token, setToken] = useState(null);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    setToken(queryToken || stored || null);
  }, [queryToken]);

  const [apps, setApps] = useState([]);
  const [connectedSlugs, setConnectedSlugs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load apps list
  useEffect(() => {
    fetch('/apps.json')
      .then((r) => r.json())
      .then(setApps)
      .catch(() => setError('Failed to load apps'));
  }, []);

  // Fetch connected status when token is available
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    fetch(`${API_URL}/connect/status/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error('Invalid or expired link');
        return r.json();
      })
      .then((data) => {
        setConnectedSlugs(data.connected || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [token]);

  // Group apps by category
  const categories = useMemo(() => {
    const grouped = {};
    for (const app of apps) {
      if (!grouped[app.category]) grouped[app.category] = [];
      grouped[app.category].push(app);
    }
    return Object.entries(grouped).map(([name, items]) => ({ name, apps: items }));
  }, [apps]);

  const connectedCount = connectedSlugs.length;
  const totalCount = apps.length;

  function handleConnect(slug) {
    window.location.href = `${API_URL}/connect/initiate?app=${slug}&token=${token}`;
  }

  function handleDisconnect(slug) {
    fetch(`${API_URL}/connect/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app: slug, token }),
    })
      .then((r) => {
        if (r.ok) setConnectedSlugs((prev) => prev.filter((s) => s !== slug));
      });
  }

  if (!token && !loading && router.isReady) {
    return (
      <Layout>
        <div className="text-center py-20 px-4">
          <h1 className="text-2xl font-bold text-white mb-4">Missing token</h1>
          <p className="text-neutral-400">This page requires a valid link from your SMS. Text START to get a new link.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Head>
        <title>Connect Your Apps — Wingman</title>
      </Head>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Connect your apps</h1>
        <p className="text-neutral-400 mb-6">
          The more you connect, the more Wingman can do for you.
        </p>

        {/* Progress */}
        <div className="mb-8">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-neutral-400">{connectedCount} of {totalCount} apps connected</span>
            <span className="text-accent font-medium">
              {totalCount > 0 ? Math.round((connectedCount / totalCount) * 100) : 0}%
            </span>
          </div>
          <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-500"
              style={{ width: totalCount > 0 ? `${(connectedCount / totalCount) * 100}%` : '0%' }}
            />
          </div>
        </div>

        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-4 mb-6 text-red-300 text-sm">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-neutral-500">Loading your apps...</div>
        ) : (
          <div className="space-y-4">
            {categories.map((cat) => (
              <AppCategory
                key={cat.name}
                category={cat.name}
                apps={cat.apps}
                connectedApps={connectedSlugs}
                onConnect={handleConnect}
                onDisconnect={handleDisconnect}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
