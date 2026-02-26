import { useState } from 'react';
import AppCard from './AppCard';

const categoryIcons = {
  Calendar: '\ud83d\udcc5',
  Finance: '\ud83d\udcb0',
  Tasks: '\u2705',
  Email: '\ud83d\udce8',
  Communication: '\ud83d\udcac',
  Entertainment: '\ud83c\udfa7',
  Developer: '\ud83d\udc19',
  Travel: '\ud83d\uddfa\ufe0f',
  Food: '\ud83c\udf54',
  AI: '\ud83e\udde0',
  Storage: '\ud83d\udcc1',
  Health: '\u231a',
};

export default function AppCategory({ category, apps, connectedApps, onConnect, onDisconnect }) {
  const [open, setOpen] = useState(true);
  const connectedCount = apps.filter((a) => connectedApps.includes(a.slug)).length;

  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-neutral-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{categoryIcons[category] || '\ud83d\udccc'}</span>
          <span className="font-semibold text-white">{category}</span>
          <span className="text-xs text-neutral-500">
            {connectedCount}/{apps.length} connected
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-neutral-500 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2">
          {apps.map((app) => (
            <AppCard
              key={app.slug}
              app={app}
              isConnected={connectedApps.includes(app.slug)}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
            />
          ))}
        </div>
      )}
    </div>
  );
}
