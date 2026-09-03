import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/control", "/control/"] }],
    // Both, side by side: sitemap.xml lists everything, news-sitemap.xml
    // lists only the last two days in the Google News format.
    sitemap: ["https://aifootball.am/sitemap.xml", "https://aifootball.am/news-sitemap.xml"],
  };
}
