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

// A plain football, not a stylised one: a white ball with the black
// pentagons everybody recognises. Drawn rather than photographed so it
// stays sharp at the 32 pixels a profile picture is actually seen at.
const pentagon = (cx, cy, r, rotation, fill) => {
  const points = Array.from({ length: 5 }, (_, i) => {
    const angle = ((rotation + i * 72 - 90) * Math.PI) / 180;
    return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
  return `<polygon points="${points}" fill="${fill}"/>`;
};

const ball = (size, dark) => {
  const outer = Array.from({ length: 5 }, (_, i) => {
    const angle = ((i * 72 - 90) * Math.PI) / 180;
    return pentagon(50 + 32 * Math.cos(angle), 50 + 32 * Math.sin(angle), 13, 180 + i * 72, dark);
  }).join("");
  const seams = Array.from({ length: 5 }, (_, i) => {
    const a = ((i * 72 - 90) * Math.PI) / 180;
    return `<line x1="${50 + 15 * Math.cos(a)}" y1="${50 + 15 * Math.sin(a)}" x2="${50 + 21 * Math.cos(a)}" y2="${50 + 21 * Math.sin(a)}" stroke="${dark}" stroke-width="3"/>`;
  }).join("");
  return `
<svg width="${size}" height="${size}" viewBox="0 0 100 100">
  <defs><clipPath id="ballclip"><circle cx="50" cy="50" r="47"/></clipPath></defs>
  <circle cx="50" cy="50" r="47" fill="#ffffff"/>
  <g clip-path="url(#ballclip)">
    ${pentagon(50, 50, 16, 0, dark)}
    ${outer}
    ${seams}
  </g>
</svg>`;
};

// The profile picture is the site's own mark at poster size: the green
// tile, the ball on it, the wordmark under it. Facebook crops it to a
// circle and shows it at 32 pixels in a feed, so the ball is what carries
// it - the wordmark is there for the page header, where it is 170 pixels.
const lockup = (field, ink, aiColor, ring) => `<!doctype html><html><body style="margin:0">
<div style="width:1024px;height:1024px;position:relative;display:grid;place-items:center;background:${field};font-family:${FONT}">
  <div style="position:absolute;inset:46px;border-radius:50%;border:7px solid ${ring}"></div>
  <div style="display:grid;place-items:center;gap:52px">
    <div>${ball(430, "#08150e")}</div>
    <div style="color:${ink};font-size:84px;font-weight:900;letter-spacing:-.045em;line-height:.9;white-space:nowrap"><span style="color:${aiColor}">AI</span>FOOTBALL<span style="opacity:.66">.AM</span></div>
  </div>
</div></body></html>`;

// Variant A: the accent green as the whole field, which is what stands out
// in a feed of white cards.
const profile = lockup("#2fd181", "#062315", "#ffffff", "rgba(6,35,21,.26)");

// Variant B: the site's near-black, for anyone who prefers the darker page.
const profileAlt = lockup("#08100b", "#f5f8f5", "#2fd181", "rgba(47,209,129,.36)");

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
if (!players.length) console.log("  no photographs resolved - the cover will carry the wordmark alone");

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
    <div style="width:132px;height:132px;display:grid;place-items:center;border-radius:34px;background:#2fd181">${ball(96, "#08150e")}</div>
    <div>
      <div style="color:#f5f8f5;font-size:60px;font-weight:900;letter-spacing:-.03em;line-height:1;white-space:nowrap"><span style="color:#2fd181">AI</span>FOOTBALL<span style="color:#f28c18">.AM</span></div>
      <div style="margin-top:12px;color:#a9bdaf;font-size:24px;font-weight:700">Ֆուտբոլը՝ արագ, խելացի, հայերեն</div>
    </div>
  </div>
</div></body></html>`;

// The cover already in public/ was drawn with the five photographs on it.
// Without an API key none of them resolve, and rewriting the file would
// quietly replace a cover that has faces with one that does not - so the
// wordmark-only version is written beside it, under its own name, and the
// real cover is only rebuilt when the photographs are there.
const coverName = players.length ? "fb-cover.png" : "fb-cover-logo.png";

const browser = await chromium.launch();
for (const [name, html, width, height] of [
  ["fb-profile.png", profile, 1024, 1024],
  ["fb-profile-alt.png", profileAlt, 1024, 1024],
  [coverName, cover, 1640, 856],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `aisport-am/public/${name}` });
  console.log(name, fs.statSync(`aisport-am/public/${name}`).size, "bytes");
}
await browser.close();
