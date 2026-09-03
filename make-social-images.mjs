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

const cover = `<!doctype html><html><body style="margin:0">
<div style="width:1640px;height:856px;display:grid;place-items:center;background:radial-gradient(circle at 30% 20%, #12211a 0%, #08100b 60%);font-family:${FONT}">
  <div style="display:flex;align-items:center;gap:34px">
    <div style="width:150px;height:150px;display:grid;place-items:center;border-radius:30px;background:#2fd181;color:#062315;font-size:68px;font-weight:900">AI</div>
    <div>
      <div style="color:#f5f8f5;font-size:78px;font-weight:900;letter-spacing:-.03em;line-height:1">FOOTBALL<span style="color:#2fd181">.AM</span></div>
      <div style="margin-top:16px;color:#91a296;font-size:30px;font-weight:700">Ֆուտբոլը՝ արագ, խելացի, հայերեն</div>
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
  await page.screenshot({ path: `aisport-am/public/${name}` });
  console.log(name, fs.statSync(`aisport-am/public/${name}`).size, "bytes");
}
await browser.close();
