import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { motion } from 'framer-motion';
import Layout from '../../components/Layout';

export default function ConnectSuccess() {
  const router = useRouter();
  const { app } = router.query;

  const appName = app
    ? app.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'App';

  // If opened as popup, notify parent and close
  useEffect(() => {
    if (window.opener) {
      window.opener.postMessage({ type: 'oauth-success', app: app || '' }, '*');
      setTimeout(() => window.close(), 1500);
    }
  }, [app]);

  return (
    <Layout>
      <Head>
        <title>Connected! — Wingman</title>
      </Head>

      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
          className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-accent/10 mb-6"
        >
          <motion.svg
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.3 }}
            className="w-10 h-10 text-accent"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={3}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </motion.svg>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-2xl sm:text-3xl font-bold text-white mb-3"
        >
          {appName} connected!
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="text-zinc-400 mb-8"
        >
          Wingman can now access your {appName} data. You're all set.
        </motion.p>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex flex-col gap-3"
        >
          <a
            href="/connect"
            className="inline-block bg-surface border border-border hover:border-border-hover text-white font-medium px-6 py-3 rounded-xl transition-colors"
          >
            Connect more apps
          </a>
          <a
            href="/chat"
            className="text-sm text-zinc-500 hover:text-accent transition-colors"
          >
            Start chatting with Wingman
          </a>
        </motion.div>
      </div>
    </Layout>
  );
}
