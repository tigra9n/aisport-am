import { sizedImage } from "../../../lib/image-proxy";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { getOpinionBySlug } from "../../../lib/opinions";

export const dynamic = "force-dynamic";

const FALLBACK_IMAGE = "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1600&q=85";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const opinion = await getOpinionBySlug(slug);
  if (!opinion) return {};

  const { title, category, imageUrl } = opinion;
  const description = opinion.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
  const image = imageUrl ?? FALLBACK_IMAGE;
  const url = `https://aifootball.am/opinions/${slug}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      siteName: "AIFootball",
      title,
      description,
      url,
      locale: "hy_AM",
      images: [{ url: image, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
    other: { "article:section": category },
  };
}

function youtubeEmbedUrl(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
}

// Content is now trusted admin-authored HTML, not plain text - this is a
// token-protected, single-author admin form (only Tigran can submit),
// same trust boundary as any CMS where the logged-in author can write raw
// HTML. Blank-line-separated paragraphs still get wrapped automatically so
// he doesn't have to manually type <p> tags for ordinary text, while any
// HTML he does write (a link, an <img>, an <iframe> embed) passes through
// untouched wherever he places it, including mid-paragraph.
function formatOpinionContent(raw: string): string {
  return raw
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export default async function OpinionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opinion = await getOpinionBySlug(slug);
  if (!opinion) notFound();

  const embedUrl = opinion.videoUrl ? youtubeEmbedUrl(opinion.videoUrl) : null;

  return (
    <main>
      <SiteHeader />
      <article className="article-shell">
        <div className="article-header">
          <span className="page-kicker">{opinion.category}</span>
          <h1>{opinion.title}</h1>
          <p>{opinion.role} · {opinion.author}</p>
        </div>
        {opinion.imageUrl && (
          <img src={sizedImage(opinion.imageUrl, 700)} alt="" className="article-image" style={{ width: "100%", borderRadius: 12, marginBottom: 24 }} decoding="async" fetchPriority="high" />
        )}
        {embedUrl && (
          <div style={{ position: "relative", paddingBottom: "56.25%", height: 0, marginBottom: 24, borderRadius: 12, overflow: "hidden" }}>
            <iframe
              src={embedUrl}
              title={opinion.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 }}
            />
          </div>
        )}
        {!embedUrl && opinion.videoUrl && (
          <p style={{ marginBottom: 24 }}><a href={opinion.videoUrl} target="_blank" rel="noreferrer">🎬 Video դիտել</a></p>
        )}
        <div className="article-content" dangerouslySetInnerHTML={{ __html: formatOpinionContent(opinion.content) }} />
      </article>
      <SiteFooter />
    </main>
  );
}
