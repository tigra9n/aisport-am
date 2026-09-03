"use client";

/* eslint-disable @next/next/no-img-element */
import { sizedImage } from "../lib/image-proxy";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ArticlePreview } from "../lib/content";

// Homepage "Լրահոս" list used to be a fixed slice of 9 articles with no
// way to see anything older - scrolling to the bottom of the list just
// hit a dead end. This makes it a real infinite-scroll feed: it watches
// for the user nearing the bottom of the scrollable list and fetches the
// next page from /api/articles?offset=N, appending results in place.
export function HeadlineFeed({ initialArticles, initialOffset }: { initialArticles: ArticlePreview[]; initialOffset: number }) {
  const [items, setItems] = useState<ArticlePreview[]>(initialArticles);
  const [offset, setOffset] = useState(initialOffset);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // The site publishes roughly every twenty minutes, and the page did not
  // notice. Anyone who left the tab open - Tigran twice today - saw a strip
  // labelled "24/7, updating" showing the same headlines it had an hour
  // earlier and concluded the site had stopped. It had not; the page simply
  // never asked again.
  //
  // Polling the first page every ninety seconds and prepending whatever is
  // new. It only touches the top of the list, so anything already loaded by
  // scrolling stays where it is, and the offset moves by however many
  // arrived so the next scroll page does not repeat them. Nothing is
  // announced when nothing is new.
  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      // Asking while the tab is in the background wakes a phone's radio for
      // a list nobody is looking at.
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/articles?offset=0&limit=9", { cache: "no-store" });
        const data = await res.json() as { previews?: ArticlePreview[] };
        const latest = data.previews ?? [];
        if (cancelled || !latest.length) return;
        setItems((prev) => {
          const seen = new Set(prev.map((a) => a.slug));
          const fresh = latest.filter((a) => !seen.has(a.slug));
          if (!fresh.length) return prev;
          setOffset((current) => current + fresh.length);
          return [...fresh, ...prev];
        });
      } catch {
        // A failed poll is not worth telling the reader about; the next one
        // is ninety seconds away.
      }
    };

    const timer = window.setInterval(poll, 90_000);
    // And immediately when the reader comes back to the tab, which is when
    // the staleness is most obvious.
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    const root = listRef.current;
    if (!sentinel || !root || done) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) loadMore();
    }, { root, rootMargin: "200px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset, loading, done]);

  async function loadMore() {
    if (loading || done) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/articles?offset=${offset}&limit=9`);
      const data = await res.json() as { previews?: ArticlePreview[] };
      const next = data.previews ?? [];
      if (!next.length) {
        setDone(true);
      } else {
        setItems((prev) => {
          const seen = new Set(prev.map((a) => a.slug));
          return [...prev, ...next.filter((a) => !seen.has(a.slug))];
        });
        setOffset((prev) => prev + next.length);
        if (next.length < 9) setDone(true);
      }
    } catch {
      // Silent: worst case the user just doesn't get more on this
      // particular scroll attempt, sentinel stays observed for a retry.
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="headline-feed-list" ref={listRef}>
      {items.map((article) => (
        <Link prefetch={false} className="headline-feed-item" href={`${article.basePath ?? "/news"}/${article.slug}`} key={article.slug}>
          <img src={sizedImage(article.image, 140)} alt={article.title} referrerPolicy="no-referrer" loading="lazy" decoding="async" />
          <div><span>{article.category}</span><h3>{article.title}</h3><time>{article.time}</time></div>
        </Link>
      ))}
      {!done && <div ref={sentinelRef} className="headline-feed-sentinel">{loading ? "Բեռնվում է..." : ""}</div>}
    </div>
  );
}
