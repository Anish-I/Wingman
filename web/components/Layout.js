import Link from 'next/link';

export default function Layout({ children }) {
  return (
    <div className="min-h-screen flex flex-col bg-bg text-neutral-200">
      <header className="border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center">
          <Link href="/" className="text-xl font-bold text-white tracking-tight">
            TextFlow
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border py-6 text-center text-sm text-neutral-500">
        TextFlow — Your digital life, one text away
      </footer>
    </div>
  );
}
