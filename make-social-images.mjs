// The Facebook page needs a profile picture and a cover, and the site has
// no image files of its own - the logo is drawn in HTML. So draw it at the
// sizes Facebook wants and photograph it.
//
// Sizes: the profile picture is displayed as a circle, so everything that
// matters stays well inside the middle; the cover is cropped differently on
// phones than on desktop, so the wordmark sits in the safe centre band
// rather than near an edge.
import { chromium } from "playwright";
import fs from "node:fs";

fs.mkdirSync("aisport-am/public", { recursive: true });

// Single quotes around the family names, not double: this string is
// interpolated into a style="..." attribute, and a double quote there ends
// the attribute and takes the whole font stack with it - which is how the
// wordmark used to come out in Times.
//
// Liberation Sans is Arial's metric-compatible twin and is the family that
// is actually installed where this runs; asking for Arial first does not
// help, because fontconfig answers that request with a serif. DejaVu Sans
// is last because it is the one here that carries Armenian, for the line
// under the wordmark on the cover.
const FONT = `'Liberation Sans', Arial, Helvetica, 'Noto Sans Armenian', 'DejaVu Sans', sans-serif`;

// A real ball, not a diagram of one. The panels are the actual truncated
// icosahedron - twelve pentagons, twenty hexagons - turned so that a
// pentagon faces the camera, projected onto a sphere, and lit from the
// upper left. Every edge is drawn as an arc of the great circle between
// its corners, which is what makes the ball look round rather than faceted,
// and each panel is shaded by how much it faces the light. Drawn rather
// than photographed: no licence to worry about, and it stays sharp at any
// size Facebook decides to serve it at.
const PHI = (1 + Math.sqrt(5)) / 2;
const norm = (v) => { const l = Math.hypot(...v); return v.map((c) => c / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mul = (M, v) => M.map((row) => dot(row, v));
const mm = (A, B) => A.map((row, i) => [0, 1, 2].map((j) => [0, 1, 2].reduce((sum, k) => sum + A[i][k] * B[k][j], 0)));

// Every even (i.e. cyclic) permutation of the coordinates, with every sign.
const spread = (base) => {
  const out = [];
  for (const sx of [1, -1]) for (const sy of [1, -1]) for (const sz of [1, -1]) {
    const [x, y, z] = [sx * base[0], sy * base[1], sz * base[2]];
    out.push([x, y, z], [y, z, x], [z, x, y]);
  }
  return out;
};
const dedupe = (list) => {
  const out = [];
  for (const v of list) if (!out.some((u) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]) < 1e-7)) out.push(v);
  return out;
};

const CORNERS = dedupe([[0, 1, 3 * PHI], [1, 2 + PHI, 2 * PHI], [PHI, 2, 2 * PHI + 1]].flatMap(spread).map(norm));
// A pentagon sits on each icosahedron vertex, a hexagon on each of its faces.
const PENTAGON_AXES = dedupe(spread([0, 1, PHI]).map(norm));
const HEXAGON_AXES = dedupe([...spread([1, 1, 1]), ...spread([0, 1 / PHI, PHI])].map(norm));

// The corners of a panel are the corners furthest along its own axis, in the
// order you meet them going round that axis.
const panel = (axis, pentagon) => {
  const reach = CORNERS.map((v) => dot(v, axis));
  const best = Math.max(...reach);
  const ring = CORNERS.filter((_, i) => reach[i] > best - 1e-6);
  const u = norm(ring[0].map((c, i) => c - axis[i] * dot(ring[0], axis)));
  const w = cross(axis, u);
  return { pentagon, axis, ring: ring.sort((a, b) => Math.atan2(dot(a, w), dot(a, u)) - Math.atan2(dot(b, w), dot(b, u))) };
};
const PANELS = [...PENTAGON_AXES.map((a) => panel(a, true)), ...HEXAGON_AXES.map((a) => panel(a, false))];

// Turn the ball so the first pentagon points at the camera, a little up and
// to the left, then spin it about the line of sight.
const align = (a, b) => {
  const v = cross(a, b), c = dot(a, b), s = Math.hypot(...v);
  const K = [[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]];
  const K2 = mm(K, K), f = (1 - c) / (s * s);
  return K.map((row, i) => row.map((val, j) => (i === j ? 1 : 0) + val + K2[i][j] * f));
};
const spin = (a) => [[Math.cos(a), -Math.sin(a), 0], [Math.sin(a), Math.cos(a), 0], [0, 0, 1]];
const VIEW = mm(spin(0.35), align(PENTAGON_AXES[0], norm([-0.16, 0.2, 1])));
const LIGHT = norm([-0.38, 0.58, 0.72]);

const arc = (a, b, t) => {
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, b))));
  if (angle < 1e-6) return a;
  return norm(a.map((c, i) => (Math.sin((1 - t) * angle) * c + Math.sin(t * angle) * b[i]) / Math.sin(angle)));
};
const shade = (hex, f) => "#" + [1, 3, 5].map((i) => Math.max(0, Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * f))).toString(16).padStart(2, "0")).join("");

// The gap between panels, as a fraction of the way from a corner towards the
// middle of its own panel: the seams are the white body showing through.
const SEAM = 0.052;

const ball = (size, key) => {
  const r = 230, c = 256;
  const faces = PANELS.filter((p) => mul(VIEW, p.axis)[2] > 0.015).map((p) => {
    const inset = p.ring.map((v) => norm(v.map((coord, i) => coord * (1 - SEAM) + p.axis[i] * SEAM * 1.9)));
    const points = inset.flatMap((from, i) => {
      const to = inset[(i + 1) % inset.length];
      return [0, 0.25, 0.5, 0.75].map((t) => {
        const q = mul(VIEW, arc(from, to, t));
        return `${(c + r * q[0]).toFixed(2)},${(c - r * q[1]).toFixed(2)}`;
      });
    });
    const lit = Math.max(0, dot(mul(VIEW, p.axis), LIGHT));
    return `<polygon points="${points.join(" ")}" fill="${shade(p.pentagon ? "#12100f" : "#ffffff", 0.46 + 0.62 * lit)}"/>`;
  });
  return `
<svg width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="body-${key}" cx="34%" cy="28%" r="78%">
      <stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e9edea"/><stop offset="1" stop-color="#9aa8a0"/>
    </radialGradient>
    <radialGradient id="round-${key}" cx="34%" cy="28%" r="76%">
      <stop offset="0" stop-color="#ffffff" stop-opacity=".30"/>
      <stop offset=".45" stop-color="#ffffff" stop-opacity="0"/>
      <stop offset=".86" stop-color="#04120a" stop-opacity=".22"/>
      <stop offset="1" stop-color="#04120a" stop-opacity=".52"/>
    </radialGradient>
    <radialGradient id="gleam-${key}"><stop offset="0" stop-color="#ffffff" stop-opacity=".75"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>
    <clipPath id="sphere-${key}"><circle cx="${c}" cy="${c}" r="${r}"/></clipPath>
  </defs>
  <circle cx="${c}" cy="${c}" r="${r}" fill="url(#body-${key})"/>
  <g clip-path="url(#sphere-${key})">${faces.join("")}</g>
  <circle cx="${c}" cy="${c}" r="${r}" fill="url(#round-${key})"/>
  <ellipse cx="${c - r * 0.42}" cy="${c - r * 0.5}" rx="${r * 0.34}" ry="${r * 0.24}" fill="url(#gleam-${key})" transform="rotate(-24 ${c - r * 0.42} ${c - r * 0.5})"/>
</svg>`;
};

// The profile picture: the ball, as big as the circular crop allows, over
// the address in the largest type that still clears that crop. Facebook
// shows this at 32 pixels in a feed and at 170 on the page itself, so the
// ball has to carry it on its own at the small end - hence no tile, no
// frame, nothing else in the square.
const lockup = (field, ink, accent, key) => `<!doctype html><html><body style="margin:0">
<div style="width:1024px;height:1024px;position:relative;background:${field};font-family:${FONT}">
  <div style="position:absolute;left:50%;top:398px;transform:translate(-50%,-50%)">${ball(624, key)}</div>
  <div style="position:absolute;left:0;right:0;top:806px;transform:translateY(-50%);text-align:center;color:${ink};font-size:98px;font-weight:900;letter-spacing:-.045em;line-height:1;white-space:nowrap"><span style="color:${accent}">AI</span>FOOTBALL<span style="color:${accent}">.AM</span></div>
</div></body></html>`;

// Variant A: the accent green as the whole field, which is what stands out
// in a feed of white cards.
const profile = lockup("#2fd181", "#062315", "#ffffff", "a");

// Variant B: the site's near-black, for anyone who prefers the darker page.
const profileAlt = lockup("#08100b", "#f5f8f5", "#2fd181", "b");

// The five Tigran asked for, by name. Their photographs come from the same
// API the site already uses, but the ids are not written down here - an id
// typed from memory is how you end up with a stranger's face on your cover.
// Each name is searched for and matched against what comes back.
const WANTED = [
  { search: "messi", expect: "messi", label: "Messi" },
  { search: "ronaldo", expect: "cristiano", label: "Ronaldo" },
  { search: "spertsyan", expect: "spertsyan", label: "Սպերցյան", armenian: true },
  { search: "haaland", expect: "haaland", label: "Haaland" },
  { search: "mbappe", expect: "mbappe", label: "Mbappe" },
];

const apiKey = process.env.API_FOOTBALL_KEY ?? "";
const players = [];
for (const wanted of WANTED) {
  let photo = "";
  if (apiKey) {
    try {
      const res = await fetch(`https://v3.football.api-sports.io/players/profiles?search=${encodeURIComponent(wanted.search)}`, {
        headers: { "x-apisports-key": apiKey, Accept: "application/json" },
      });
      const data = await res.json();
      const rows = (data?.response ?? []).map((r) => r.player).filter(Boolean);
      const norm = (v) => (v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const hit = rows.find((p) => norm(`${p.firstname} ${p.lastname} ${p.name}`).includes(wanted.expect)) ?? rows[0];
      if (hit?.photo) {
        photo = hit.photo;
        console.log(`  ${wanted.label} -> ${hit.name} (id ${hit.id})`);
      } else {
        console.log(`  ${wanted.label} -> no match among ${rows.length} results`);
      }
    } catch (err) {
      console.log(`  ${wanted.label} -> lookup failed: ${String(err).slice(0, 80)}`);
    }
  }
  if (photo) players.push({ ...wanted, photo });
}
if (!players.length) console.log("  no photographs resolved - leaving the cover alone, drawing the profile pictures only");

// The Armenian gets the accent ring: on a site written in Armenian, he is
// the reason someone follows this page rather than a bigger one.
const faces = players.map((p, i) => `
  <div style="position:relative;width:184px;height:184px;border-radius:50%;overflow:hidden;border:6px solid ${p.armenian ? "#2fd181" : "#1d3227"};background:#12211a;margin-left:${i ? "-30px" : "0"};z-index:${p.armenian ? 20 : 10 - i};box-shadow:0 18px 40px rgba(0,0,0,.45)">
    <img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;object-position:top center" />
  </div>`).join("");

const cover = `<!doctype html><html><body style="margin:0">
<div style="width:1640px;height:856px;position:relative;overflow:hidden;background:radial-gradient(circle at 22% 30%, #16281e 0%, #08100b 62%);font-family:${FONT}">
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;padding-right:58px">${faces}</div>
  ${players.length ? `<div style="position:absolute;inset:0;background:linear-gradient(90deg,#08100b 30%,rgba(8,16,11,.9) 44%,rgba(8,16,11,0) 62%)"></div>` : ""}
  <div style="position:absolute;top:50%;${players.length ? "left:96px;transform:translateY(-50%)" : "left:50%;transform:translate(-50%,-50%)"};display:flex;align-items:center;gap:30px">
    <div style="width:132px;height:132px;display:grid;place-items:center;border-radius:34px;background:#2fd181">${ball(96, "cover")}</div>
    <div>
      <div style="color:#f5f8f5;font-size:60px;font-weight:900;letter-spacing:-.03em;line-height:1;white-space:nowrap"><span style="color:#2fd181">AI</span>FOOTBALL<span style="color:#f28c18">.AM</span></div>
      <div style="margin-top:12px;color:#a9bdaf;font-size:24px;font-weight:700">Ֆուտբոլը՝ արագ, խելացի, հայերեն</div>
    </div>
  </div>
</div></body></html>`;

// The cover is the one with the five photographs on it. Without an API key
// none of them resolve, and a cover that is a wordmark on an empty field is
// not worth having - so in that case the cover is left exactly as it is and
// only the profile pictures are redrawn.
const browser = await chromium.launch();
for (const [name, html, width, height] of [
  ["fb-profile.png", profile, 1024, 1024],
  ["fb-profile-alt.png", profileAlt, 1024, 1024],
  ...(players.length ? [["fb-cover.png", cover, 1640, 856]] : []),
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `aisport-am/public/${name}` });
  console.log(name, fs.statSync(`aisport-am/public/${name}`).size, "bytes");
}
await browser.close();
