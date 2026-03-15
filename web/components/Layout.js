import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { getToken, clearToken } from '../lib/auth';

export default function Layout({ children }) {
  const router = useRouter();
  const [loggedIn, setLoggedIn] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setLoggedIn(!!getToken());
  }, []);

  function handleSignOut() {
    clearToken();
    setLoggedIn(false);
    router.push('/');
  }

  const navLinks = loggedIn
    ? [
        { href: '/chat', label: 'Chat' },
        { href: '/connect', label: 'Connect' },
        { href: '/workflows', label: 'Workflows' },
      ]
    : [];

  function isActive(href) {
    return router.pathname === href || router.pathname.startsWith(href + '/');
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg text-neutral-200">
      <header className="sticky top-0 z-50 glass">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-bold text-sm">
              W
            </div>
            <span className="text-lg font-bold text-white tracking-tight">Wingman</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'bg-accent-soft text-accent'
                    : 'text-zinc-400 hover:text-white hover:bg-surface-hover'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {loggedIn ? (
              <button
                onClick={handleSignOut}
                className="ml-2 px-3 py-1.5 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-surface-hover transition-colors"
              >
                Sign Out
              </button>
            ) : (
              <Link
                href="/login"
                className="ml-2 px-4 py-1.5 rounded-lg text-sm font-medium bg-accent hover:bg-accent-hover text-white transition-colors"
              >
                Sign In
              </Link>
            )}
          </nav>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 rounded-lg hover:bg-surface-hover transition-colors"
          >
            <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden border-t border-border px-4 py-3 space-y-1 animate-slide-up">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={`block px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'bg-accent-soft text-accent'
                    : 'text-zinc-400 hover:text-white hover:bg-surface-hover'
                }`}
              >
                {link.label}
              </Link>
            ))}
            {loggedIn ? (
              <button
                onClick={() => { handleSignOut(); setMobileOpen(false); }}
                className="block w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-white hover:bg-surface-hover transition-colors"
              >
                Sign Out
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm font-medium text-accent hover:bg-accent-soft transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border py-8 text-center">
        <p className="text-sm text-zinc-500">Wingman — Your digital life, one text away</p>
      </footer>
    </div>
  );
}
