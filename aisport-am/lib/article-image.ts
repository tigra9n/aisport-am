// Shared image-pool fallback used by both the homepage listing and the
// article detail page, so a given article's fallback image is consistent
// everywhere it's shown (and both places get updated together).
const categoryDefaultImages: Record<string, string[]> = {
  "Ֆուտբոլ": [
    "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1762013315117-1c8005ad2b41?auto=format&fit=crop&w=1200&q=85",
  ],
  "Բասկետբոլ": [
    "https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1200&q=85",
    "https://images.unsplash.com/photo-1548311344-5324fa0dbad6?auto=format&fit=crop&w=1200&q=85",
  ],
  "Թենիս": [
    "https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?auto=format&fit=crop&w=1200&q=85",
  ],
  "Մարմնամարզություն": [
    "https://images.unsplash.com/photo-1742249715229-0ce01dd19358?auto=format&fit=crop&w=1400&q=85",
  ],
};
// Categories without a dedicated pool (Կրիկետ, Հոկեյ, Ամերիկյան ֆուտբոլ,
// Ֆորմուլա 1, Գոլֆ, Բռնցքամարտ / ՄՄԱ, etc.) fall through here instead of
// one single fixed image.
const GENERAL_SPORT_IMAGES = [
  "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1600&q=85",
  "https://images.unsplash.com/photo-1579952363873-27f3bade9f55?auto=format&fit=crop&w=1200&q=85",
  "https://images.unsplash.com/photo-1548311344-5324fa0dbad6?auto=format&fit=crop&w=1200&q=85",
];

// Deterministic pick per article (hash of slug) so the same article
// always renders the same image - stable across requests/refreshes and
// consistent between the homepage card and the article page - while
// different articles in the same category get visual variety instead of
// one identical stock photo repeated everywhere.
function pickImage(pool: string[], seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return pool[hash % pool.length];
}

export function resolveArticleImage(category: string, seed: string): string {
  const pool = categoryDefaultImages[category] ?? GENERAL_SPORT_IMAGES;
  return pickImage(pool, seed);
}
