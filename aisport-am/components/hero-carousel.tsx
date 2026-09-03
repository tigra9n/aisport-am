"use client";

/* eslint-disable @next/next/no-img-element */
import { imageSrcSet, sizedImage } from "../lib/image-proxy";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ArticlePreview } from "../lib/content";

export function HeroCarousel({ articles }: { articles: ArticlePreview[] }) {
  const [active, setActive] = useState(0);
  const item = articles[active] ?? articles[0];

  useEffect(() => {
    if (articles.length < 2) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % articles.length), 6_000);
    return () => window.clearInterval(timer);
  }, [articles.length]);

  if (!item) return null;
  const move = (direction: number) => setActive((current) => (current + direction + articles.length) % articles.length);

  return <div className="featured-news-stack">
    <article className="main-lead hero-carousel-card" key={item.slug}>
      <Link prefetch={false} className="lead-image" href={`/news/${item.slug}`}><img src={sizedImage(item.image, 700)} srcSet={imageSrcSet(item.image, [360, 760, 1400])} sizes="(max-width:700px) calc(100vw - 24px), 700px" alt={item.title} decoding="async" fetchPriority="high" /></Link>
      <div className="lead-overlay">
        <span className="breaking-label"><i /> Գլխավոր լուր</span>
        <h1><Link href={`/news/${item.slug}`}>{item.title}</Link></h1>
        <div><span>{item.author}</span><span>•</span><span>{item.time}</span><span>•</span><span>{item.readTime} ընթերցում</span></div>
      </div>
      <button className="hero-arrow previous" type="button" aria-label="Նախորդ գլխավոր լուրը" onClick={() => move(-1)}>‹</button>
      <button className="hero-arrow next" type="button" aria-label="Հաջորդ գլխավոր լուրը" onClick={() => move(1)}>›</button>
    </article>
    <nav className="headline-thumbnails" aria-label="Գլխավոր թեմաներ">
      {articles.map((article, index) => <button className={index === active ? "active" : ""} type="button" onClick={() => setActive(index)} key={article.slug} title={article.title}>
        <img src={sizedImage(article.image, 140)} alt={article.title} referrerPolicy="no-referrer" loading="lazy" decoding="async" /><span>{article.category}</span>
      </button>)}
    </nav>
  </div>;
}
