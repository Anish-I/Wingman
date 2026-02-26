export default function AppCard({ app, isConnected, onConnect, onDisconnect }) {
  return (
    <div className="flex items-center gap-4 bg-bg border border-border rounded-lg p-4 transition-colors hover:border-neutral-600">
      <div className="text-2xl flex-shrink-0 w-10 h-10 flex items-center justify-center">
        {app.icon}
      </div>

      <div className="flex-1 min-w-0">
        <div className="font-medium text-white text-sm">{app.name}</div>
        <div className="text-xs text-neutral-500 truncate">{app.description}</div>
      </div>

      {isConnected ? (
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-accent text-sm font-medium flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Connected
          </span>
          <button
            onClick={() => onDisconnect(app.slug)}
            className="text-xs text-neutral-500 hover:text-red-400 transition-colors"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <button
          onClick={() => onConnect(app.slug)}
          className="flex-shrink-0 bg-accent hover:bg-accent-hover text-black text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
        >
          Connect
        </button>
      )}
    </div>
  );
}
