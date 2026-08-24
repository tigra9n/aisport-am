import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { CommentForm } from "../../../components/comment-form";
import { demoArticles } from "../../../lib/content";
import { getArticleBySlug } from "../../../lib/articles";
import { resolveArticleImage } from "../../../lib/article-image";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const stored = await getArticleBySlug(slug);
  const demo = demoArticles.find((article) => article.slug === slug);
  if (!stored && !demo) return {};

  const title = stored?.title ?? demo!.title;
  const excerpt = stored?.excerpt ?? demo!.excerpt;
  const category = stored?.category ?? demo!.category;
  const image = stored?.imageUrl ?? demo?.image ?? resolveArticleImage(category, slug);
  const url = `https://aisport.am/news/${slug}`;

  return {
    title,
    description: excerpt,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: "AISport",
      title,
      description: excerpt,
      url,
      locale: "hy_AM",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: excerpt,
      images: [image],
    },
  };
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const stored = await getArticleBySlug(slug);
  const demo = demoArticles.find((article) => article.slug === slug);
  if (!stored && !demo) notFound();

  const title = stored?.title ?? demo!.title;
  const excerpt = stored?.excerpt ?? demo!.excerpt;
  const category = stored?.category ?? demo!.category;
  const author = demo?.author ?? "AISport խմբագրություն";
  const image = stored?.imageUrl ?? demo?.image ?? resolveArticleImage(category, slug);
  const published = stored ? new Date(stored.publishedAt + "Z").toLocaleString("hy-AM", { timeZone: "Asia/Yerevan", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }) : demo!.time;
  const paragraphs = stored?.content.split(/\n+/).filter(Boolean) ?? [
    `${excerpt} Այս պատմության շուրջ զարգացումները կարևոր են թե՛ մարզական, թե՛ մրցակցային տեսանկյունից։ AISport-ը հավաքել է այս պահին հասանելի հիմնական փաստերը։`,
    "Թիմերն ու մարզիկները շարունակում են նախապատրաստությունը, իսկ վերջնական որոշումները սպասվում են առաջիկա օրերին։ Մասնագետները նշում են, որ հաջողության համար վճռորոշ են լինելու կայունությունը, ֆիզիկական պատրաստվածությունն ու տակտիկական ճկունությունը։",
    "Նոր տեղեկությունների դեպքում նյութը կթարմացվի։ AISport-ը հետևում է թեմային և կներկայացնի պաշտոնական հայտարարություններն ու հետագա զարգացումները։",
  ];

  return <main><SiteHeader /><article className="article-shell">
    <header className="article-header"><span className="section-label">{category}</span><h1>{title}</h1><p>{excerpt}</p><div className="article-byline"><strong>{author}</strong><span>•</span><time>{published}</time><span>•</span><span>{demo?.readTime ?? "3 րոպե"} ընթերցում</span></div></header>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {image ? <img className="article-image" src={image} alt="" /> : <div className="article-placeholder" aria-hidden="true">AI</div>}
    <div className="article-content">{paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</div>
    {stored ? <aside className="source-box"><strong>Սկզբնաղբյուր</strong><p>Նյութը պատրաստվել է հրապարակված սկզբնաղբյուրի հիման վրա։</p><a href={stored.sourceUrl} target="_blank" rel="noreferrer">Բացել սկզբնաղբյուրը ↗</a></aside> : null}
    <section className="comments-section"><h2>Մեկնաբանություններ</h2><p className="comments-intro">Միացեք քննարկմանը․ մեկնաբանությունը հրապարակվելուց առաջ կստուգվի։</p><CommentForm articleSlug={slug} /></section>
  </article><SiteFooter /></main>;
}
