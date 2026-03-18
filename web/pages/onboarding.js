import { useState, useCallback, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { motion, AnimatePresence } from 'framer-motion';
import Layout from '../components/Layout';
import { getToken } from '../lib/auth';
import { apiFetch, API_URL } from '../lib/api';
import { useRequireAuth } from '../lib/useRequireAuth';

const essentialApps = [
  { slug: 'gmail', name: 'Gmail', icon: '📨', desc: 'Read & send emails' },
  { slug: 'google-calendar', name: 'Google Calendar', icon: '📅', desc: 'Manage your schedule' },
  { slug: 'slack', name: 'Slack', icon: '💬', desc: 'Team messages' },
  { slug: 'github', name: 'GitHub', icon: '🐙', desc: 'Code & PRs' },
  { slug: 'notion', name: 'Notion', icon: '🗒️', desc: 'Notes & docs' },
  { slug: 'discord', name: 'Discord', icon: '🎮', desc: 'Communities' },
];

const categories = [
  { icon: '📨', title: 'Email & Calendar', desc: 'Send emails, check schedule, create events' },
  { icon: '✅', title: 'Tasks & Notes', desc: 'Create tasks, manage notes, track projects' },
  { icon: '💬', title: 'Communication', desc: 'Send messages on Slack, Discord, and more' },
  { icon: '🐙', title: 'Developer Tools', desc: 'Manage repos, PRs, deployments' },
  { icon: '📊', title: 'Analytics & Data', desc: 'Check metrics, generate reports' },
  { icon: '⚡', title: 'Automation', desc: 'Create cross-app workflows' },
];

export default function Onboarding() {
  const authed = useRequireAuth();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [connectedApps, setConnectedApps] = useState([]);
  const [connectingSlug, setConnectingSlug] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  // Listen for OAuth popup success
  useEffect(() => {
    function onMessage(event) {
      if (event.data?.type === 'oauth-success' && event.data.app) {
        setConnectedApps(prev => prev.includes(event.data.app) ? prev : [...prev, event.data.app]);
        setConnectingSlug(null);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const handleConnect = useCallback(async (slug) => {
    const token = getToken();
    if (!token) return;
    setConnectingSlug(slug);
    try {
      const res = await fetch(`${API_URL}/connect/create-connect-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ app: slug }),
      });
      if (!res.ok) { setConnectingSlug(null); return; }
      const { connectToken } = await res.json();
      const url = `${API_URL}/connect/initiate?connectToken=${connectToken}`;
      const popup = window.open(url, 'wingman-oauth', 'width=600,height=700');
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
                setConnectedApps(data.connected || []);
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

  async function handleChat(e) {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const token = getToken();
    setChatMessages(prev => [...prev, { role: 'user', content: text }]);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text }),
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: 'assistant', content: data.response || 'No response' }]);
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Could not connect to server.' }]);
    } finally {
      setChatLoading(false);
    }
  }

  function handleFinish() {
    router.push('/chat');
  }

  if (!authed) return null;

  const slideVariants = {
    enter: { opacity: 0, x: 50 },
    center: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 },
  };

  return (
    <Layout>
      <Head>
        <title>Get Started — Wingman</title>
      </Head>

      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        {/* Progress */}
        <div className="flex items-center gap-2 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full transition-colors ${
                i <= step ? 'bg-accent' : 'bg-border'
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="welcome"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-10">
                <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-5">
                  <span className="text-3xl">🚀</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
                  Welcome to Wingman
                </h1>
                <p className="text-zinc-400 max-w-md mx-auto">
                  Your personal AI that connects to 250+ apps and takes action on your behalf.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
                {categories.map((cat) => (
                  <div key={cat.title} className="bg-surface border border-border rounded-xl p-4 flex items-start gap-3">
                    <span className="text-xl">{cat.icon}</span>
                    <div>
                      <h3 className="text-sm font-semibold text-white">{cat.title}</h3>
                      <p className="text-xs text-zinc-500 mt-0.5">{cat.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setStep(1)}
                className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors"
              >
                Let's get started
              </button>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="connect"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold text-white mb-2">Connect your apps</h1>
                <p className="text-zinc-400">Connect at least one app to get the most out of Wingman.</p>
              </div>

              <div className="space-y-3 mb-8">
                {essentialApps.map((app) => {
                  const isConnected = connectedApps.includes(app.slug);
                  const isConnecting = connectingSlug === app.slug;
                  return (
                    <div key={app.slug} className="flex items-center gap-3 bg-surface border border-border rounded-xl p-4">
                      <span className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg bg-bg">{app.icon}</span>
                      <div className="flex-1">
                        <div className="font-medium text-white text-sm">{app.name}</div>
                        <div className="text-xs text-zinc-500">{app.desc}</div>
                      </div>
                      {isConnecting ? (
                        <span className="text-xs text-accent flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Connecting...
                        </span>
                      ) : isConnected ? (
                        <span className="text-xs text-accent font-medium flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Connected
                        </span>
                      ) : (
                        <button
                          onClick={() => handleConnect(app.slug)}
                          className="text-xs px-3.5 py-1.5 rounded-lg bg-accent/10 text-accent font-semibold hover:bg-accent/20 transition-colors"
                        >
                          Connect
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(0)}
                  className="px-6 py-3 rounded-xl border border-border text-zinc-400 hover:text-white hover:border-border-hover transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors"
                >
                  {connectedApps.length > 0 ? 'Continue' : 'Skip for now'}
                </button>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="try-it"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-6">
                <h1 className="text-2xl font-bold text-white mb-2">Try it out</h1>
                <p className="text-zinc-400">Send your first message to Wingman.</p>
              </div>

              <div className="bg-surface border border-border rounded-xl overflow-hidden mb-6">
                <div className="h-64 overflow-y-auto p-4 space-y-2">
                  {chatMessages.length === 0 && (
                    <div className="text-center py-8 text-zinc-500 text-sm">
                      Try: "What can you do?" or "Send an email to..."
                    </div>
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-accent text-white'
                          : 'bg-bg border border-border text-zinc-300'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start">
                      <div className="bg-bg border border-border rounded-xl px-3 py-2 flex gap-1">
                        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" />
                        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  )}
                </div>
                <form onSubmit={handleChat} className="flex gap-2 p-3 border-t border-border">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 outline-none focus:border-accent/50"
                  />
                  <button
                    type="submit"
                    disabled={chatLoading || !chatInput.trim()}
                    className="px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-white text-sm font-medium disabled:opacity-30 transition-colors"
                  >
                    Send
                  </button>
                </form>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-6 py-3 rounded-xl border border-border text-zinc-400 hover:text-white hover:border-border-hover transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors"
                >
                  Continue
                </button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="success"
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3 }}
            >
              <div className="text-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="w-20 h-20 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto mb-6"
                >
                  <span className="text-4xl">🎉</span>
                </motion.div>

                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">You're all set!</h1>
                <p className="text-zinc-400 max-w-md mx-auto mb-4">
                  Wingman is ready to help.
                  {connectedApps.length > 0
                    ? ` You've connected ${connectedApps.length} app${connectedApps.length > 1 ? 's' : ''}.`
                    : ' Connect some apps anytime from the Connect page.'}
                </p>

                <div className="flex flex-col gap-3 max-w-xs mx-auto mt-8">
                  <button
                    onClick={handleFinish}
                    className="w-full py-3 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold transition-colors"
                  >
                    Start chatting
                  </button>
                  <a
                    href="/connect"
                    className="text-sm text-zinc-500 hover:text-accent transition-colors"
                  >
                    Connect more apps
                  </a>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}
