import { useState, useEffect } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import Layout from '../components/Layout';
import { useRequireAuth } from '../lib/useRequireAuth';
import { apiFetch } from '../lib/api';

export default function Workflows() {
  const authed = useRequireAuth();
  const [workflows, setWorkflows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [runningId, setRunningId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  useEffect(() => {
    if (!authed) return;
    fetchWorkflows();
  }, [authed]);

  async function fetchWorkflows() {
    try {
      setLoading(true);
      const data = await apiFetch('/api/workflows');
      setWorkflows(data.workflows || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!description.trim() || creating) return;
    setCreating(true);
    setError('');
    try {
      const data = await apiFetch('/api/workflows/plan', {
        method: 'POST',
        body: JSON.stringify({ description: description.trim() }),
      });
      setWorkflows((prev) => [...(data.workflows || []), ...prev]);
      setDescription('');
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggle(wf) {
    setTogglingId(wf.id);
    try {
      const data = await apiFetch(`/api/workflows/${wf.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !wf.active }),
      });
      setWorkflows((prev) => prev.map((w) => (w.id === wf.id ? data.workflow : w)));
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleRun(wf) {
    setRunningId(wf.id);
    setError('');
    try {
      await apiFetch(`/api/workflows/${wf.id}/run`, { method: 'POST' });
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningId(null);
    }
  }

  function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleString([], {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  if (!authed) return null;

  return (
    <Layout>
      <Head>
        <title>Workflows — Wingman</title>
      </Head>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Workflows</h1>
          <p className="text-zinc-400">Automate tasks across your connected apps.</p>
        </div>

        {/* Create form */}
        <form onSubmit={handleCreate} className="bg-surface border border-border rounded-xl p-5 space-y-3">
          <label className="block text-sm font-medium text-zinc-300">
            Describe your automation
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Every morning, send me a summary of my calendar events in Slack..."
            rows={3}
            className="w-full bg-bg border border-border rounded-xl px-4 py-3 text-sm text-white placeholder-zinc-600 outline-none focus:border-accent/50 transition-colors resize-none"
          />
          <button
            type="submit"
            disabled={creating || !description.trim()}
            className="bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:hover:bg-accent text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors flex items-center gap-2"
          >
            {creating && (
              <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {creating ? 'Creating...' : 'Create Workflow'}
          </button>
        </form>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-xl px-4 py-3"
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Loading */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-xl skeleton" />
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && workflows.length === 0 && (
          <div className="text-center py-16">
            <div className="w-16 h-16 rounded-2xl bg-surface border border-border flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            </div>
            <p className="text-zinc-400 text-sm font-medium">No workflows yet</p>
            <p className="text-zinc-600 text-xs mt-1">Describe an automation above to get started</p>
          </div>
        )}

        {/* Workflow list */}
        <div className="space-y-3">
          <AnimatePresence>
            {workflows.map((wf) => (
              <motion.div
                key={wf.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-surface border border-border rounded-xl p-5 space-y-3 card-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">{wf.name}</h3>
                    {wf.description && (
                      <p className="text-xs text-zinc-400 mt-0.5 line-clamp-2">{wf.description}</p>
                    )}
                  </div>
                  <span
                    className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full ${
                      wf.active !== false
                        ? 'bg-accent/10 text-accent'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {wf.active !== false ? 'Active' : 'Paused'}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-[11px] text-zinc-500">
                  <span>Trigger: {wf.trigger_type || 'manual'}</span>
                  {wf.cron_expression && <span>Cron: {wf.cron_expression}</span>}
                  <span>Last run: {formatDate(wf.last_run_at || wf.updated_at)}</span>
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleToggle(wf)}
                    disabled={togglingId === wf.id}
                    className="text-xs px-3.5 py-1.5 rounded-lg border border-border text-zinc-300 hover:text-white hover:border-border-hover transition-colors disabled:opacity-40"
                  >
                    {togglingId === wf.id ? '...' : wf.active !== false ? 'Pause' : 'Resume'}
                  </button>
                  <button
                    onClick={() => handleRun(wf)}
                    disabled={runningId === wf.id}
                    className="text-xs px-3.5 py-1.5 rounded-lg bg-accent/10 hover:bg-accent/20 text-accent font-medium transition-colors disabled:opacity-40"
                  >
                    {runningId === wf.id ? 'Running...' : 'Run Now'}
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </Layout>
  );
}
