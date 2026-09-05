// Playwright announces itself: navigator.webdriver is true in every browser
// it drives. app/layout.tsx reads that flag and withholds Google Analytics
// from automated visitors, which stopped the audits inflating the site's
// reader numbers - and started them measuring a page no reader ever gets,
// one without gtag.js, the single heaviest script the site loads. The
// evening it shipped, the home page appeared to drop from 595 KB to 418 KB
// and /live from 984 KB to 478 KB. Nothing had got faster.
//
// So the measuring scripts put the flag back and let gtag.js load, while
// dropping the hit gtag.js would send. Weight and timings are then the ones
// a person on a phone actually pays, and Analytics still records nothing.
export async function measureAsAReader(context) {
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
  });
  // The script is wanted; only the beacon is dropped. GA4 sends its hits to
  // /g/collect on google-analytics.com, analytics.google.com, or a regional
  // subdomain of the first.
  await context.route(
    /(google-analytics\.com|analytics\.google\.com)\/.*collect/i,
    (route) => route.abort(),
  );
}
