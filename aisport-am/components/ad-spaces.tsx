export function AdSpaces({ bottom = false }: { bottom?: boolean }) {
  if (bottom) return <div className="site-shell ad-slot ad-slot-bottom"><span>Գովազդ</span><strong>Գովազդային տարածք</strong></div>;
  return <><div className="site-shell ad-slot ad-slot-top"><span>Գովազդ</span><strong>Վերին գովազդային տարածք</strong></div><aside className="ad-side-rail left" aria-label="Ձախ գովազդային տարածք">Գովազդ</aside><aside className="ad-side-rail right" aria-label="Աջ գովազդային տարածք">Գովազդ</aside></>;
}
