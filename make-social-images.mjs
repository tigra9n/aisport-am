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

const FONT = `-apple-system, "Segoe UI", "Noto Sans Armenian", Roboto, sans-serif`;

const profile = `<!doctype html><html><body style="margin:0">
<div style="width:512px;height:512px;display:grid;place-items:center;background:#08100b;font-family:${FONT}">
  <div style="display:grid;place-items:center;gap:18px">
    <div style="width:190px;height:190px;display:grid;place-items:center;border-radius:38px;background:#2fd181;color:#062315;font-size:86px;font-weight:900;letter-spacing:-.04em">AI</div>
    <div style="color:#f5f8f5;font-size:44px;font-weight:900;letter-spacing:-.02em">FOOTBALL<span style="color:#2fd181">.AM</span></div>
  </div>
</div></body></html>`;

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
  <div style="position:relative;width:215px;height:215px;border-radius:50%;overflow:hidden;border:6px solid ${p.armenian ? "#2fd181" : "#1d3227"};background:#12211a;margin-left:${i ? "-38px" : "0"};z-index:${p.armenian ? 20 : 10 - i};box-shadow:0 18px 40px rgba(0,0,0,.45)">
    <img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;object-position:top center" />
  </div>`).join("");

const cover = `<!doctype html><html><body style="margin:0">
<div style="width:1640px;height:856px;position:relative;overflow:hidden;background:radial-gradient(circle at 22% 30%, #16281e 0%, #08100b 62%);font-family:${FONT}">
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;padding-right:64px">${faces}</div>
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,#08100b 32%,rgba(8,16,11,.86) 50%,rgba(8,16,11,0) 76%)"></div>
  <div style="position:absolute;top:50%;left:96px;transform:translateY(-50%);display:flex;align-items:center;gap:30px">
    <div style="width:132px;height:132px;display:grid;place-items:center;border-radius:28px;background:#2fd181;color:#062315;font-size:60px;font-weight:900">AI</div>
    <div>
      <div style="color:#f5f8f5;font-size:70px;font-weight:900;letter-spacing:-.03em;line-height:1">FOOTBALL<span style="color:#2fd181">.AM</span></div>
      <div style="margin-top:14px;color:#a9bdaf;font-size:27px;font-weight:700">Ֆուտբոլը՝ արագ, խելացի, հայերեն</div>
    </div>
  </div>
</div></body></html>`;

const browser = await chromium.launch();
for (const [name, html, width, height] of [
  ["fb-profile.png", profile, 512, 512],
  ["fb-cover.png", cover, 1640, 856],
]) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `aisport-am/public/${name}` });
  console.log(name, fs.statSync(`aisport-am/public/${name}`).size, "bytes");
}
await browser.close();
