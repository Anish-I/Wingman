import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import Layout from '../components/Layout';

const appIcons = [
  { name: 'Gmail', icon: 'M' },
  { name: 'Slack', icon: 'S' },
  { name: 'GitHub', icon: 'G' },
  { name: 'Notion', icon: 'N' },
  { name: 'Discord', icon: 'D' },
  { name: 'Calendar', icon: 'C' },
  { name: 'Spotify', icon: 'S' },
  { name: 'Trello', icon: 'T' },
  { name: 'Linear', icon: 'L' },
  { name: 'Dropbox', icon: 'D' },
  { name: 'Todoist', icon: 'T' },
  { name: 'Figma', icon: 'F' },
];

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
      </svg>
    ),
    title: 'Natural Language',
    desc: 'Just text what you need. No commands to memorize, no buttons to find.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
      </svg>
    ),
    title: '250+ Integrations',
    desc: 'Gmail, Slack, GitHub, Calendar, Notion, Discord — connect them all in one tap.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    ),
    title: 'Smart Workflows',
    desc: 'Automate repetitive tasks across your apps. Describe it in English, Wingman handles the rest.',
  },
];

const steps = [
  { num: '01', title: 'Sign up', desc: 'Create your account with just a phone number or Google sign-in.' },
  { num: '02', title: 'Connect your apps', desc: 'One-click OAuth for all your favorite tools and services.' },
  { num: '03', title: 'Just ask', desc: 'Text or chat anything. Wingman understands context and takes action.' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' },
  }),
};

export default function Home() {
  return (
    <Layout>
      <Head>
        <title>Wingman — Your AI assistant for everything</title>
        <meta name="description" content="Wingman connects to 250+ apps and lets you control your digital life through natural conversation." />
      </Head>

      {/* Hero */}
      <section className="relative overflow-hidden">
        {/* Background gradient orbs */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-gradient-radial from-accent/8 via-transparent to-transparent pointer-events-none" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-20 pb-24 text-center">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={0}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-soft border border-accent/20 text-accent text-sm font-medium mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            250+ app integrations
          </motion.div>

          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={1}
            className="text-4xl sm:text-5xl md:text-7xl font-extrabold tracking-tight text-white leading-[1.1] mb-6"
          >
            Your entire digital life,
            <br />
            <span className="text-gradient">one conversation away.</span>
          </motion.h1>

          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={2}
            className="text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Wingman is a personal AI that connects to your apps and takes action.
            Send emails, manage tasks, check your calendar — all through natural conversation.
          </motion.p>

          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            custom={3}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/login"
              className="px-8 py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-base transition-all hover:shadow-lg hover:shadow-accent/20"
            >
              Get Started Free
            </Link>
            <Link
              href="/chat"
              className="px-8 py-3.5 rounded-xl bg-surface border border-border hover:border-border-hover text-white font-medium text-base transition-all"
            >
              Try Web Chat
            </Link>
          </motion.div>
        </div>
      </section>

      {/* App icon carousel */}
      <section className="py-12 border-y border-border/50 overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 mb-6">
          <p className="text-center text-sm text-zinc-500 font-medium uppercase tracking-wider">
            Works with your favorite apps
          </p>
        </div>
        <div className="flex gap-4 animate-[shimmer_20s_linear_infinite]">
          {[...appIcons, ...appIcons].map((app, i) => (
            <div
              key={i}
              className="flex-shrink-0 flex items-center gap-2.5 px-4 py-2 rounded-lg bg-surface border border-border"
            >
              <div className="w-8 h-8 rounded-md bg-accent/10 text-accent flex items-center justify-center font-bold text-sm">
                {app.icon}
              </div>
              <span className="text-sm text-zinc-300 font-medium whitespace-nowrap">{app.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-16 animate-fade-up" style={{ animationDelay: '0.4s', animationFillMode: 'both' }}>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Everything you need, nothing you don't
          </h2>
          <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            No complex dashboards. No learning curve. Just tell Wingman what you need.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 stagger-children">
          {features.map((f) => (
            <div
              key={f.title}
              className="group bg-surface border border-border rounded-2xl p-6 card-hover"
            >
              <div className="w-12 h-12 rounded-xl bg-accent/10 text-accent flex items-center justify-center mb-4 group-hover:bg-accent/15 transition-colors">
                {f.icon}
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{f.title}</h3>
              <p className="text-zinc-400 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-24">
        <div className="text-center mb-16 animate-fade-up" style={{ animationDelay: '0.6s', animationFillMode: 'both' }}>
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Up and running in minutes
          </h2>
        </div>

        <div className="space-y-6 stagger-children">
          {steps.map((s) => (
            <div
              key={s.num}
              className="flex items-start gap-6 bg-surface border border-border rounded-2xl p-6"
            >
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-accent/10 text-accent font-bold text-lg flex items-center justify-center font-mono">
                {s.num}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">{s.title}</h3>
                <p className="text-zinc-400 leading-relaxed">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-24">
        <div className="absolute inset-0 bg-hero-gradient pointer-events-none" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Ready to simplify your digital life?
          </h2>
          <p className="text-zinc-400 text-lg mb-8">
            Join Wingman and connect all your apps in one place.
          </p>
          <Link
            href="/login"
            className="inline-block px-8 py-3.5 rounded-xl bg-accent hover:bg-accent-hover text-white font-semibold text-base transition-all hover:shadow-lg hover:shadow-accent/20"
          >
            Get Started Free
          </Link>
        </div>
      </section>
    </Layout>
  );
}
