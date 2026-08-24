export type FeedItem = { title: string; link: string; snippet: string; imageUrl: string | null; pubDate: string | null };

function decodeEntities(text: string) {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractTag(block: string, tag: string): string | null {
  const cdataMatch = block.match(new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`, "i"));
  if (cdataMatch) return decodeEntities(cdataMatch[1].trim());
  const plainMatch = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (plainMatch) return decodeEntities(plainMatch[1].replace(/<[^>]+>/g, "").trim());
  return null;
}

function extractImage(block: string): string | null {
  // Attribute order varies between feeds (url before type, or vice versa),
  // so match each attribute independently rather than requiring a fixed
  // order - this was silently failing to extract images from some feeds
  // (e.g. ESPN), causing articles to fall back to a generic per-category
  // stock photo instead of a real per-article image.
  const enclosureMatch = block.match(/<enclosure\b([^>]*)\/?>/i);
  if (enclosureMatch) {
    const attrs = enclosureMatch[1];
    const typeMatch = attrs.match(/type=["']([^"']+)["']/i);
    const urlMatch = attrs.match(/url=["']([^"']+)["']/i);
    if (urlMatch && (!typeMatch || /^image/i.test(typeMatch[1]))) return urlMatch[1];
  }
  const mediaContent = block.match(/<media:content\b[^>]*url=["']([^"']+)["']/i);
  if (mediaContent) return mediaContent[1];
  const thumbnail = block.match(/<media:thumbnail\b[^>]*url=["']([^"']+)["']/i);
  if (thumbnail) return thumbnail[1];
  const imgTag = block.match(/<img\b[^>]*src=["']([^"']+)["']/i);
  return imgTag ? imgTag[1] : null;
}

export async function fetchFeed(feedUrl: string, limit = 10): Promise<FeedItem[]> {
  try {
    const response = await fetch(feedUrl, { headers: { "User-Agent": "AISportBot/1.0 (+https://aisport.am)" } });
    if (!response.ok) return [];
    const xml = await response.text();
    const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) ?? [];
    return items.slice(0, limit).map((block) => ({
      title: extractTag(block, "title") ?? "",
      link: (extractTag(block, "link") ?? extractTag(block, "guid") ?? "").trim(),
      snippet: (extractTag(block, "description") ?? extractTag(block, "summary") ?? "").slice(0, 500),
      imageUrl: extractImage(block),
      pubDate: extractTag(block, "pubDate"),
    })).filter((item) => item.title && item.link);
  } catch (err) {
    console.error(`[feeds] fetch failed for ${feedUrl}: ${String(err)}`);
    return [];
  }
}
