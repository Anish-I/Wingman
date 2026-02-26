import { useRouter } from 'next/router';
import Head from 'next/head';
import Layout from '../../components/Layout';
import Link from 'next/link';

export default function ConnectSuccess() {
  const router = useRouter();
  const { app, token } = router.query;

  const appName = app
    ? app.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : 'App';

  return (
    <Layout>
      <Head>
        <title>Connected! — TextFlow</title>
      </Head>

      <div className="max-w-md mx-auto px-4 py-20 text-center">
        {/* Checkmark animation */}
        <div className="animate-checkmark inline-flex items-center justify-center w-20 h-20 rounded-full bg-accent/20 mb-6">
          <svg className="w-10 h-10 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-3">
          {appName} connected!
        </h1>
        <p className="text-neutral-400 mb-8">
          You're all set. Go back to texting — TextFlow can now access your {appName} data.
        </p>

        <Link
          href={token ? `/connect?token=${token}` : '/connect'}
          className="inline-block bg-surface border border-border hover:border-neutral-600 text-white font-medium px-6 py-3 rounded-lg transition-colors"
        >
          Connect more apps
        </Link>

        <p className="mt-6 text-sm text-neutral-500">
          Or just text TextFlow — it's ready to help.
        </p>
      </div>
    </Layout>
  );
}
