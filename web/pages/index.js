import Head from 'next/head';
import Layout from '../components/Layout';

const features = [
  {
    icon: '\ud83d\udcc5',
    title: 'Smart Calendar',
    desc: 'Text "What\'s my day look like?" and get your full schedule. Reschedule meetings with a simple reply.',
  },
  {
    icon: '\ud83d\udcb3',
    title: 'Spending Tracker',
    desc: 'Ask "How much did I spend this week?" and get a breakdown. Set budgets and get alerts via text.',
  },
  {
    icon: '\u2705',
    title: 'Task Manager',
    desc: 'Text "Remind me to call Mom at 5pm" and it just works. Check off tasks by replying "done".',
  },
];

const steps = [
  { num: '1', title: 'Text START', desc: 'Send a text to our number to create your account instantly.' },
  { num: '2', title: 'Connect your apps', desc: 'Tap the link we send to connect your calendar, bank, and more.' },
  { num: '3', title: 'Just text', desc: 'Ask anything about your digital life. We handle the rest.' },
];

export default function Home() {
  return (
    <Layout>
      <Head>
        <title>Wingman — Your digital life, one text away</title>
        <meta name="description" content="Wingman is a personal AI you text like a friend. It manages your calendar, finances, tasks, and more." />
      </Head>

      {/* Hero */}
      <section className="text-center py-20 px-4 max-w-3xl mx-auto">
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-white leading-tight">
          Your entire digital life,<br />one text away.
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-neutral-400 max-w-xl mx-auto">
          Wingman is a personal AI you text like a friend. It manages your calendar, finances, tasks, and more.
        </p>
        <div className="mt-10 inline-block bg-accent text-black font-bold text-xl sm:text-2xl px-8 py-4 rounded-xl">
          Text <span className="font-mono">START</span> to (762) 320-1647
        </div>
        <p className="mt-3 text-sm text-neutral-500">No app to download. No account to create.</p>
        <a href="/chat" className="mt-4 inline-block text-accent hover:underline text-sm">Try the Chat Simulator</a>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 py-16">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="bg-surface border border-border rounded-xl p-6">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-neutral-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-3xl mx-auto px-4 py-16">
        <h2 className="text-2xl sm:text-3xl font-bold text-white text-center mb-12">How it works</h2>
        <div className="space-y-8">
          {steps.map((s) => (
            <div key={s.num} className="flex items-start gap-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-accent text-black font-bold flex items-center justify-center text-lg">
                {s.num}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">{s.title}</h3>
                <p className="text-neutral-400 mt-1">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </Layout>
  );
}
