import { useState, useEffect, useMemo, useCallback } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import Layout from '../../components/Layout';
import { getToken } from '../../lib/auth';
import { useRequireAuth } from '../../lib/useRequireAuth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const categoryIcons = {
  Calendar: '📅', Finance: '💰', Tasks: '✅', Email: '📨',
  Communication: '💬', Entertainment: '🎧', Developer: '🐙',
  Travel: '🗺️', Food: '🍔', AI: '🧠', Storage: '📁', Health: '⌚',
};

function Skeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-20 rounded-xl skeleton" />
      ))}
    </div>
  );
}

export default function ConnectPage() {
  const authed = useRequireAuth();
  const [apps, setApps] = useState([]);
  const [connectedSlugs, setConnectedSlugs] = useState([]);
  const [appsLoading, setAppsLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [connectingSlug, setConnectingSlug] = useState(null);

  // Load apps list
  useEffect(() => {
    fetch('/apps.json')
      .then((r) => r.json())
      .then((data) => { setApps(data); setAppsLoading(false); })
      .catch(() => { setError('Failed to load apps'); setAppsLoading(false); });
  }, []);

  // Fetch connected status
  useEffect(() => {
    if (!authed) return;
    const token = getToken();
    if (!token) return;
    setStatusLoading(true);
    fetch(`${API_URL}/connect/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to fetch status');
        return r.json();
      })
      .then((data) => {
        setConnectedSlugs(data.connected || []);
        setStatusLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setStatusLoading(false);
      });
  }, [authed]);

  // Listen for popup OAuth success
  useEffect(() => {
    function onMessage(event) {
      if (event.data?.type === 'oauth-success') {
        const { app } = event.data;
        if (app) {
          setConnectedSlugs((prev) => prev.includes(app) ? prev : [...prev, app]);
          setConnectingSlug(null);
        }
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Filter apps
  const filteredApps = useMemo(() => {
    if (!search.trim()) return apps;
    const q = search.toLowerCase();
    return apps.filter(
      (a) => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q) || a.slug.toLowerCase().includes(q)
    );
  }, [apps, search]);

  // Group by category
  const categories = useMemo(() => {
    const grouped = {};
    for (const app of filteredApps) {
      if (!grouped[app.category]) grouped[app.category] = [];
      grouped[app.category].push(app);
    }
    return Object.entries(grouped).map(([name, items]) => ({ name, apps: items }));
  }, [filteredApps]);

  // Popular apps (first 6)
  const popularApps = useMemo(() => {
    return apps.filter(a => ['gmail', 'google-calendar', 'slack', 'github', 'notion', 'discord'].includes(a.slug));
  }, [apps]);

  const connectedCount = connectedSlugs.length;

  const handleConnect = useCallback(async (slug) => {
    const token = getToken();
    if (!token) return;
    setConnectingSlug(slug);
    try {
      // Create a short-lived, single-use connect token (avoids exposing JWT in URL)
      const res = await fetch(`${API_URL}/connect/create-connect-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ app: slug }),
      });
      if (!res.ok) { setConnectingSlug(null); return; }
      const { connectToken } = await res.json();
      const url = `${API_URL}/connect/initiate?connectToken=${connectToken}`;
      const popup = window.open(url, 'wingman-oauth', 'width=600,height=700,left=200,top=100');
      if (!popup || popup.closed) {
        window.location.href = url;
        return;
      }
      const interval = setInterval(() => {
        if (popup.closed) {
          clearInterval(interval);
          setTimeout(() => {
            fetch(`${API_URL}/connect/status`, {
              headers: { Authorization: `Bearer ${token}` },
            })
              .then(r => r.json())
              .then(data => {
                setConnectedSlugs(data.connected || []);
                setConnectingSlug(null);
              })
              .catch(() => setConnectingSlug(null));
          }, 1500);
        }
      }, 500);
    } catch {
      setConnectingSlug(null);
    }
  }, []);

  const handleDisconnect = useCallback((slug) => {
    const token = getToken();
    if (!token) return;
    fetch(`${API_URL}/connect/disconnect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ app: slug }),
    }).then((r) => {
      if (r.ok) setConnectedSlugs((prev) => prev.filter((s) => s !== slug));
    });
  }, []);

  if (!authed) return null;

  return (
    <Layout>
      <Head>
        <title>Connect Apps — Wingman</title>
      </Head>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Connect your apps</h1>
          <p className="text-zinc-400">
            The more you connect, the more Wingman can do for you.
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8 p-4 bg-surface border border-border rounded-xl">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-zinc-400">{connectedCount} app{connectedCount !== 1 ? 's' : ''} connected</span>
            <span className="text-accent font-medium">{connectedCount > 0 ? 'Active' : 'Get started'}</span>
          </div>
          <div className="w-full h-1.5 bg-bg rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-accent rounded-full"
              initial={{ width: 0 }}
              animate={{ width: apps.length > 0 ? `${Math.min((connectedCount / apps.length) * 100, 100)}%` : '0%' }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
            />
          </div>
        </div>

        {/* Search + view toggle */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search apps..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-surface border border-border text-sm text-white placeholder-zinc-600 outline-none focus:border-accent/50 transition-colors"
            />
          </div>
          <div className="flex bg-surface border border-border rounded-xl overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2.5 transition-colors ${viewMode === 'grid' ? 'bg-accent/10 text-accent' : 'text-zinc-500 hover:text-white'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z" />
              </svg>
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2.5 transition-colors ${viewMode === 'list' ? 'bg-accent/10 text-accent' : 'text-zinc-500 hover:text-white'}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-6 text-red-400 text-sm">
            {error}
          </div>
        )}

        {(appsLoading || statusLoading) ? (
          <Skeleton />
        ) : (
          <div className="space-y-8">
            {/* Popular section (only show when not searching) */}
            {!search.trim() && popularApps.length > 0 && (
              <div>
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">Popular</h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-2'}>
                  {popularApps.map((app) => (
                    <AppItem
                      key={app.slug}
                      app={app}
                      isConnected={connectedSlugs.includes(app.slug)}
                      isConnecting={connectingSlug === app.slug}
                      onConnect={handleConnect}
                      onDisconnect={handleDisconnect}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Categories */}
            {categories.map((cat) => (
              <div key={cat.name}>
                <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span>{categoryIcons[cat.name] || '📌'}</span>
                  {cat.name}
                  <span className="text-xs text-zinc-600 font-normal">
                    ({cat.apps.filter(a => connectedSlugs.includes(a.slug)).length}/{cat.apps.length})
                  </span>
                </h2>
                <div className={viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-2'}>
                  {cat.apps.map((app) => (
                    <AppItem
                      key={app.slug}
                      app={app}
                      isConnected={connectedSlugs.includes(app.slug)}
                      isConnecting={connectingSlug === app.slug}
                      onConnect={handleConnect}
                      onDisconnect={handleDisconnect}
                      viewMode={viewMode}
                    />
                  ))}
                </div>
              </div>
            ))}

            {filteredApps.length === 0 && (
              <div className="text-center py-12">
                <p className="text-zinc-500 text-sm">No apps match "{search}"</p>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function AppItem({ app, isConnected, isConnecting, onConnect, onDisconnect, viewMode }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`flex items-center gap-3 bg-surface border border-border rounded-xl p-3.5 card-hover ${
        viewMode === 'list' ? '' : ''
      }`}
    >
      <div className="text-2xl flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-bg">
        {app.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-white text-sm">{app.name}</div>
        <div className="text-xs text-zinc-500 truncate">{app.description}</div>
      </div>

      {isConnecting ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <svg className="w-4 h-4 animate-spin text-accent" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-xs text-accent font-medium">Connecting...</span>
        </div>
      ) : isConnected ? (
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-accent text-xs font-medium flex items-center gap-1">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Connected
          </span>
          <button
            onClick={() => onDisconnect(app.slug)}
            className="text-xs text-zinc-600 hover:text-red-400 transition-colors"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          onClick={() => onConnect(app.slug)}
          className="flex-shrink-0 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold px-3.5 py-1.5 rounded-lg transition-colors"
        >
          Connect
        </button>
      )}
    </motion.div>
  );
}
