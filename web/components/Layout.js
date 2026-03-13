import Link from 'next/link';

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-bg text-neutral-200">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center">
          <Link href="/" className="text-xl font-bold text-white tracking-tight">
            Wingman
          </Link>
          <nav className="ml-auto flex items-center gap-6">
            <Link href="/login" className="text-neutral-400 hover:text-white text-sm">Sign In</Link>
            <Link href="/chat" className="text-neutral-400 hover:text-white text-sm">Chat</Link>
            <Link href="/connect" className="text-neutral-400 hover:text-white text-sm">Connect</Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border py-6 text-center text-sm text-neutral-500">
        Wingman — Your digital life, one text away
      </footer>
    </div>
  );
}
