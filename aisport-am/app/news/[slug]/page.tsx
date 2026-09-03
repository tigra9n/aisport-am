import { imageSrcSet, shareImage, sizedImage } from "../../../lib/image-proxy";
import { tagHref, tagIsPage } from "../../../lib/tag-links";
import { categories } from "../../../lib/content";
import { ShareRow } from "../../../components/share-row";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { CommentForm } from "../../../components/comment-form";
import { CommentList } from "../../../components/comment-list";
import { getArticleBySlug, getArticlesByCategory } from "../../../lib/articles";
import { resolveArticleImage } from "../../../lib/article-image";
import { FOUNDER_NAME } from "../../../lib/site-info";
import { readingMinutes as minutesToRead } from "../../../lib/reading-time";

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
      images: [{ url: shareImage(image), width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title: displayTitle,
      description: displayDescription,
      images: [shareImage(image)],
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

  const readingMinutes = minutesToRead(stored.content);

  // Same-category related articles - internal linking so search engines
  // (and readers) can discover other relevant coverage instead of the
  // article page being a dead end.
  const related = (await getArticlesByCategory(category, 7)).filter((a) => a.slug !== slug).slice(0, 3);

  // Tags that reach a real page come first. They are the links worth
  // following, for a reader and for a crawler alike, and the row is often
  // long enough that the tail of it gets skimmed past.
  const orderedTags = [...tags].sort((a, b) => Number(tagIsPage(b)) - Number(tagIsPage(a)));

  const categorySlug = categories.find((c) => c.name === category)?.slug ?? null;

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
      url: "https://aifootball.am",
      logo: { "@type": "ImageObject", url: "https://aifootball.am/favicon.svg" },
      founder: { "@type": "Person", name: FOUNDER_NAME },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": `https://aifootball.am/news/${slug}` },
    articleSection: category,
    inLanguage: "hy",
    ...(tags.length ? { keywords: tags.join(", ") } : {}),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Գլխավոր", item: "https://aifootball.am/" },
      ...(categorySlug ? [{ "@type": "ListItem", position: 2, name: category, item: `https://aifootball.am/category/${categorySlug}` }] : []),
      { "@type": "ListItem", position: categorySlug ? 3 : 2, name: title, item: `https://aifootball.am/news/${slug}` },
    ],
  };

  return <main><SiteHeader /><article className="article-shell">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }} />
    <nav className="article-breadcrumb" aria-label="Նավարկություն"><Link href="/">Գլխավոր</Link><span>›</span>{categorySlug ? <Link href={`/category/${categorySlug}`}>{category}</Link> : <span>{category}</span>}</nav>
    <header className="article-header"><span className="section-label">{category}</span><h1>{title}</h1><p>{excerpt}</p><div className="article-byline"><strong><Link href="/about" className="byline-link">{author}</Link></strong><span>•</span><time>{published}</time><span>•</span><span>{readingMinutes} րոպե ընթերցում</span></div></header>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image ? <img className="article-image" src={sizedImage(image, 900)} srcSet={imageSrcSet(image, [360, 760, 1300])} sizes="(max-width:700px) calc(100vw - 24px), 900px" alt={title} referrerPolicy="no-referrer" decoding="async" fetchPriority="high" /> : <div className="article-placeholder" aria-hidden="true">AI</div>}
    <div className="article-content">{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
    <ShareRow url={`https://aifootball.am/news/${slug}`} title={title} />
    {tags.length > 0 ? <div className="article-tags">{orderedTags.map((tag) => <Link prefetch={false} key={tag} href={tagHref(tag)} className={tagIsPage(tag) ? "article-tag is-page" : "article-tag"}>#{tag}</Link>)}</div> : null}
    <aside className="source-box"><strong>Սկզբնաղբյուր</strong><p>Նյութը պատրաստվել է հրապարակված սկզբնաղբյուրի հիման վրա։</p><a href={sourceUrl} target="_blank" rel="noreferrer">Բացել սկզբնաղբյուրը ↗</a></aside>
    {related.length > 0 ? <section className="related-articles"><h2>{category}․ ևս</h2><ul className="related-list">{related.map((a) => <li key={a.slug}><Link href={`/news/${a.slug}`}>{a.title}</Link></li>)}</ul></section> : null}
    <section className="comments-section"><h2>Մեկնաբանություններ</h2><p className="comments-intro">Միացեք քննարկմանը․ մեկնաբանությունը հրապարակվելուց առաջ կստուգվի։</p><CommentList articleSlug={slug} /><CommentForm articleSlug={slug} /></section>
  </article><SiteFooter /></main>;
}
