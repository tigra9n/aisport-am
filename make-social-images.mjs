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

// The cover carries the players the site is actually writing about,
// pulled from its own top-scorer table rather than picked by hand: the
// photographs are the ones already on every page of the site, and the
// selection stays current on its own whenever this is regenerated.
const browser0 = await chromium.launch();
const scout = await browser0.newPage({ viewport: { width: 1400, height: 900 } });
await scout.goto("https://aifootball.am/topscorers", { waitUntil: "load", timeout: 60000 }).catch(() => {});
await scout.waitForTimeout(2500);
const players = await scout.evaluate(() =>
  [...document.querySelectorAll(".topscorers-table tbody tr")].slice(0, 5).map((row) => ({
    name: row.querySelector("strong")?.textContent?.trim() ?? "",
    photo: row.querySelector("img")?.currentSrc ?? row.querySelector("img")?.src ?? "",
  })).filter((p) => p.photo));
await browser0.close();
console.log("players on the cover:", players.map((p) => p.name).join(", ") || "none found");

const faces = players.map((p, i) => `
  <div style="position:relative;width:210px;height:210px;border-radius:50%;overflow:hidden;border:5px solid ${i === 0 ? "#2fd181" : "#1d3227"};background:#12211a;margin-left:${i ? "-34px" : "0"};z-index:${10 - i};box-shadow:0 18px 40px rgba(0,0,0,.45)">
    <img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;object-position:top center" />
  </div>`).join("");

const cover = `<!doctype html><html><body style="margin:0">
<div style="width:1640px;height:856px;position:relative;overflow:hidden;background:radial-gradient(circle at 22% 30%, #16281e 0%, #08100b 62%);font-family:${FONT}">
  <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;padding-right:70px;opacity:.95">${faces}</div>
  <div style="position:absolute;inset:0;background:linear-gradient(90deg,#08100b 34%,rgba(8,16,11,.85) 52%,rgba(8,16,11,0) 78%)"></div>
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
