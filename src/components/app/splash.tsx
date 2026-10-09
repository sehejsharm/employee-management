/**
 * The loading screen shown on the first visit of a browser session. Rendered
 * on the server and animated with CSS only, so it covers the first paint and
 * costs nothing once it has played. The boot script in the root layout hides
 * it on every later page load in the same session.
 */
export function Splash() {
  return (
    <div className="fr-splash" aria-hidden>
      <div className="fr-splash__glow" />
      <div className="fr-splash__ring" />
      <div className="fr-splash__ring" />
      <div className="relative flex flex-col items-center">
        <svg className="fr-splash__mark" viewBox="0 0 64 64" width="84" height="84">
          <defs>
            <linearGradient id="splash-f" x1="0" y1="0" x2="0.4" y2="1">
              <stop offset="0%" stopColor="#7cc0fa" />
              <stop offset="100%" stopColor="#3b8ef5" />
            </linearGradient>
            <linearGradient id="splash-r" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#2f86f0" />
              <stop offset="100%" stopColor="#1655c0" />
            </linearGradient>
          </defs>
          <g className="fr-splash__f" fill="url(#splash-f)">
            <rect x="12" y="8" width="5" height="48" />
            <rect x="12" y="8" width="29" height="5" />
            <rect x="12" y="27.5" width="18" height="5" />
          </g>
          <g className="fr-splash__r" fill="url(#splash-r)">
            <path
              fillRule="evenodd"
              d="M26 56 V27.5 H40.5 A10 10 0 0 1 40.5 47.5 H31 V56 Z M31 32.5 V42.5 H40.5 A5 5 0 0 0 40.5 32.5 Z"
            />
            <path d="M35 47.5 H41 L52 56 H45.2 Z" />
          </g>
        </svg>
        <div className="fr-splash__word mt-5 text-center">
          <div className="text-[19px] font-semibold tracking-[-0.01em] text-fg">Focus Realm</div>
          <div className="mt-1 text-[10.5px] font-medium uppercase tracking-[0.32em] text-fg-subtle">Workspace</div>
        </div>
        <div className="fr-splash__bar mt-6 h-[3px] w-28 overflow-hidden rounded-full bg-line">
          <span className="block h-full origin-left rounded-full bg-gradient-to-r from-brand-400 to-brand-700" />
        </div>
      </div>
    </div>
  );
}
