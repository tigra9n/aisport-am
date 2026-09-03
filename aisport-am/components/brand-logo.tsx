/* The brand mark, in one place, so the header, the footer and the favicon
   cannot drift apart: the tile from the site's accent green, and on it the
   ball everybody recognises at a glance - the classic panelled football,
   drawn rather than photographed so it survives being shrunk to the 16
   pixels of a browser tab.

   The tile and the ball take their colours from CSS custom properties (see
   .brand-mark in globals.css) so the mark follows the light and dark
   themes; the footer sits on its own near-black panel and pins them back
   to the dark values.

   The panels around the rim are full pentagons cut off by the ball's own
   edge, which is what gives the ball its curve - hence the clipPath, and
   hence `idSuffix`: the mark is drawn more than once per page and two
   elements may not share an id. */

const PANELS = [
  "20.00,15.71 24.08,18.67 22.52,23.47 17.48,23.47 15.92,18.67",
  "20.00,14.91 16.69,12.50 17.95,8.60 22.05,8.60 23.31,12.50",
  "24.84,18.43 26.11,14.53 30.21,14.53 31.47,18.43 28.16,20.83",
  "22.99,24.12 27.09,24.12 28.36,28.02 25.04,30.43 21.73,28.02",
  "17.01,24.12 18.27,28.02 14.96,30.43 11.64,28.02 12.91,24.12",
  "15.16,18.43 11.84,20.83 8.53,18.43 9.79,14.53 13.89,14.53",
];

const SEAMS: [number, number, number, number][] = [
  [20.0, 15.98, 20.0, 14.37],
  [23.82, 18.76, 25.35, 18.26],
  [22.36, 23.25, 23.31, 24.55],
  [17.64, 23.25, 16.69, 24.55],
  [16.18, 18.76, 14.65, 18.26],
];

export function BrandMark({ idSuffix }: { idSuffix: string }) {
  const clipId = `brand-ball-${idSuffix}`;
  return (
    <svg className="aif-mark" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
      <defs>
        <clipPath id={clipId}><circle cx="20" cy="20" r="12.6" /></clipPath>
      </defs>
      <rect className="aif-tile" width="40" height="40" rx="11" />
      <circle className="aif-ball" cx="20" cy="20" r="12.6" />
      <g className="aif-panels" clipPath={`url(#${clipId})`}>
        {PANELS.map((points) => <polygon key={points} points={points} />)}
        {SEAMS.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}-${y1}`} x1={x1} y1={y1} x2={x2} y2={y2} strokeWidth="0.8" strokeLinecap="round" />
        ))}
      </g>
    </svg>
  );
}

export function BrandLogo({ idSuffix }: { idSuffix: string }) {
  return (
    <>
      <BrandMark idSuffix={idSuffix} />
      <span className="aif-word"><b>AI</b>Football<i>.am</i></span>
    </>
  );
}
