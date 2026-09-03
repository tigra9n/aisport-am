import { sizedImage } from "../../../lib/image-proxy";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { CommentForm } from "../../../components/comment-form";
import { CommentList } from "../../../components/comment-list";
import { getArticleBySlug, getArticlesByCategory } from "../../../lib/articles";
import { resolveArticleImage } from "../../../lib/article-image";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const stored = await getArticleBySlug(slug);
  if (!stored) return {};

  const { title, excerpt, category, seoTitle, metaDescription } = stored;
  // seoTitle/metaDescription (from the extended AI-generation schema) are
  // used only for the page <title>/meta tags - the on-page headline
  // (rendered separately below in the page body) always shows the real
  // editorial title, since that one's tuned for readers, not search
  // engines, and the two can reasonably differ.
  const displayTitle = seoTitle || title;
  const displayDescription = metaDescription || excerpt;
  const image = stored.imageUrl ?? resolveArticleImage(category, slug);
  const url = `https://aifootball.am/news/${slug}`;

  return {
    title: displayTitle,
    description: displayDescription,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: "AIFootball",
      title: displayTitle,
      description: displayDescription,
      url,
      locale: "hy_AM",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: displayTitle,
      description: displayDescription,
      images: [image],
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stored = await getArticleBySlug(slug);
  if (!stored) notFound();

  const { title, excerpt, category, sourceUrl, tags: tagsJson } = stored;
  const tags = (() => {
    if (!tagsJson) return [];
    try {
      const parsed = JSON.parse(tagsJson);
      return Array.isArray(parsed) ? parsed.filter((t): t is string => typeof t === "string") : [];
    } catch {
      return [];
    }
  })();
  const author = "AIFootball խմբագրություն";
  const image = stored.imageUrl ?? resolveArticleImage(category, slug);
  const published = new Date(stored.publishedAt + "Z").toLocaleString("hy-AM", { timeZone: "Asia/Yerevan", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  const paragraphs = stored.content.split(/\n+/).filter(Boolean);

  // Same-category related articles - internal linking so search engines
  // (and readers) can discover other relevant coverage instead of the
  // article page being a dead end.
  const related = (await getArticlesByCategory(category, 7)).filter((a) => a.slug !== slug).slice(0, 3);

  const publishedIso = new Date(stored.publishedAt + "Z").toISOString();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: title,
    description: excerpt,
    image: [image],
    datePublished: publishedIso,
    dateModified: publishedIso,
    author: [{ "@type": "Organization", name: "AIFootball խմբագրություն", url: "https://aifootball.am" }],
    publisher: {
      "@type": "Organization",
      name: "AIFootball",
      logo: { "@type": "ImageObject", url: "https://aifootball.am/favicon.svg" },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `https://aifootball.am/news/${slug}` },
    articleSection: category,
    inLanguage: "hy",
    ...(tags.length ? { keywords: tags.join(", ") } : {}),
  };

  return <main><SiteHeader /><article className="article-shell">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <header className="article-header"><span className="section-label">{category}</span><h1>{title}</h1><p>{excerpt}</p><div className="article-byline"><strong>{author}</strong><span>•</span><time>{published}</time><span>•</span><span>3 րոպե ընթերցում</span></div></header>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image ? <img className="article-image" src={sizedImage(image, 900)} alt="" referrerPolicy="no-referrer" decoding="async" fetchPriority="high" /> : <div className="article-placeholder" aria-hidden="true">AI</div>}
    <div className="article-content">{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
    {tags.length > 0 ? <div className="article-tags">{tags.map((tag) => <Link key={tag} href={`/search?q=${encodeURIComponent(tag)}`} className="article-tag">#{tag}</Link>)}</div> : null}
    <aside className="source-box"><strong>Սկզբնաղբյուր</strong><p>Նյութը պատրաստվել է հրապարակված սկզբնաղբյուրի հիման վրա։</p><a href={sourceUrl} target="_blank" rel="noreferrer">Բացել սկզբնաղբյուրը ↗</a></aside>
    {related.length > 0 ? <section className="related-articles"><h2>{category}․ ևս</h2><ul className="related-list">{related.map((a) => <li key={a.slug}><Link href={`/news/${a.slug}`}>{a.title}</Link></li>)}</ul></section> : null}
    <section className="comments-section"><h2>Մեկնաբանություններ</h2><p className="comments-intro">Միացեք քննարկմանը․ մեկնաբանությունը հրապարակվելուց առաջ կստուգվի։</p><CommentList articleSlug={slug} /><CommentForm articleSlug={slug} /></section>
  </article><SiteFooter /></main>;
}
