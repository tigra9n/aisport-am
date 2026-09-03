import { sizedImage } from "../lib/image-proxy";
import Link from "next/link";
import type { ArticlePreview } from "../lib/content";

export function NewsCard({ article, compact = false }: { article: ArticlePreview; compact?: boolean }) {
  return (
    <article className={`modern-news-card ${compact ? "compact" : ""}`}>
      <Link className="card-media" href={`/news/${article.slug}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={sizedImage(article.image, 420)} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
        {article.local ? <span className="armenia-chip">Հայաստան</span> : null}
      </Link>
      <div className="card-copy">
        <span className="section-label">{article.category}</span>
        <h3><Link href={`/news/${article.slug}`}>{article.title}</Link></h3>
        {!compact ? <p>{article.excerpt}</p> : null}
        <div className="card-meta"><span>{article.time}</span><span>{article.readTime} ընթերցում</span></div>
      </div>
    </article>
  );
}
