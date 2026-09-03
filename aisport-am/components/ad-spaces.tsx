// The ad slots, and the switch that keeps them out of the page until there
// is something to put in them.
//
// The placeholders used to render as visible dashed boxes reading "Վերին
// գովազդային տարածք" on the home page and the live page - a reader met
// them above the first headline and the site read as unfinished. Worse,
// this is exactly what an ad network's reviewer sees on the page they are
// judging.
//
// So the component renders nothing at all while ADS_ENABLED is false: no
// box, no reserved height, no side rails. When a network approves the
// site, flip this one constant, drop their script into the slots below,
// and every placement comes back at once.
const ADS_ENABLED = false;

export function AdSpaces({ bottom = false }: { bottom?: boolean }) {
  if (!ADS_ENABLED) return null;

  if (bottom) return <div className="site-shell ad-slot ad-slot-bottom"><span>Գովազդ</span><strong>Գովազդային տարածք</strong></div>;
  return <><div className="site-shell ad-slot ad-slot-top"><span>Գովազդ</span><strong>Վերին գովազդային տարածք</strong></div><aside className="ad-side-rail left" aria-label="Ձախ գովազդային տարածք">Գովազդ</aside><aside className="ad-side-rail right" aria-label="Աջ գովազդային տարածք">Գովազդ</aside></>;
}
