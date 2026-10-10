import { BrandMark } from "@/components/brand/logo";

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
        <BrandMark size={84} className="fr-splash__mark" parts={{ f: "fr-splash__f", r: "fr-splash__r" }} />
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
