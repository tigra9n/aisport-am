import { notFound } from "next/navigation";
import { SiteFooter } from "../../../components/site-footer";
import { SiteHeader } from "../../../components/site-header";
import { getOpinionBySlug } from "../../../lib/opinions";

export const dynamic = "force-dynamic";

export default async function OpinionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opinion = await getOpinionBySlug(slug);
  if (!opinion) notFound();

  return (
    <main>
      <SiteHeader />
      <article className="article-shell">
        <div className="article-header">
          <span className="page-kicker">Խմբագրական տեսակետ</span>
          <h1>{opinion.title}</h1>
          <p>{opinion.role} · {opinion.author}</p>
        </div>
        <div className="article-content" style={{ whiteSpace: "pre-wrap" }}>{opinion.content}</div>
      </article>
      <SiteFooter />
    </main>
  );
}
