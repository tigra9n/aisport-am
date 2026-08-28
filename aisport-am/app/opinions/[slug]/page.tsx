import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { getOpinionBySlug } from "../../../lib/opinions";

export const dynamic = "force-dynamic";

function youtubeEmbedUrl(url: string): string | null {
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  return match ? `https://www.youtube.com/embed/${match[1]}` : null;
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
          <img src={opinion.imageUrl} alt="" className="article-image" style={{ width: "100%", borderRadius: 12, marginBottom: 24 }} />
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
        <div className="article-content" style={{ whiteSpace: "pre-wrap" }}>{opinion.content}</div>
      </article>
      <SiteFooter />
    </main>
  );
}
