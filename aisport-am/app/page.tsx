/* eslint-disable @next/next/no-img-element */
import { sizedImage } from "../lib/image-proxy";
import Link from "next/link";
import { Suspense } from "react";
import { LeagueTabs } from "../components/league-tabs";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { HeroCarousel } from "../components/hero-carousel";
import { HeadlineFeed } from "../components/headline-feed";
import { AdSpaces } from "../components/ad-spaces";
import { MatchModal } from "../components/match-modal";
import { trendingTopics, type ArticlePreview } from "../lib/content";
import { leagues } from "../lib/football";
import { getStandings } from "../lib/football-server";
import { getTopScorers } from "../lib/topscorers-server";
import { getLiveMatches } from "../lib/live-football-server";
import { getPublishedArticles, getArticlesByCategory, toPreview } from "../lib/articles";
import { getOpinions, type Opinion } from "../lib/opinions";

import type { Metadata } from "next";

// Without this the old domain's home page and this one look to a crawler
// like two unrelated copies of the same thing.
export const metadata: Metadata = { alternates: { canonical: "https://aifootball.am/" } };

// The live-score request must run in the production Worker. Without this,
// the page can be prerendered at deploy time and never reach the live API.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

// International Football keeps its AI content pipeline. Armenian Football
// and Armenian Sport now come from Tigran's own hand-written Opinions
// pieces instead (filtered by category) - previously these were separate
// from the homepage's "by sport" breakdown entirely, but showing them
// here as their own sections makes the site's actual coverage visible at
// a glance.
const homepageSports = [
  { name: "Միջազգային ֆուտբոլ", slug: "football", source: "articles" as const, dbCategory: "Ֆուտբոլ" },
  { name: "Հայկական ֆուտբոլ", slug: "armenian-football", source: "opinions" as const, opinionCategory: "Հայկական ֆուտբոլ" },
  { name: "Հայկական սպորտ", slug: "armenian-sport", source: "opinions" as const, opinionCategory: "Հայկական սպորտ" },
];

function opinionToPreview(o: Opinion): ArticlePreview {
  const text = o.content.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return {
    slug: o.slug,
    category: o.category,
    title: o.title,
    excerpt: text.slice(0, 160),
    author: `${o.role} · ${o.author}`,
    time: new Date(o.publishedAt + "Z").toLocaleString("hy-AM", { timeZone: "Asia/Yerevan", hour: "2-digit", minute: "2-digit", hour12: false }),
    readTime: "3 րոպե",
    image: o.imageUrl || "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&w=1200&q=85",
    local: true,
    featured: false,
    basePath: "/opinions",
  };
}

export default async function Home() {
  const [articleRows, opinionRowsForFeed, standings, scorers, live] = await Promise.all([
    getPublishedArticles(20),
    // Fetched across all categories so Armenian Football/Sport opinions
    // can be interleaved chronologically into the homepage headline feed
    // alongside regular AI-generated articles, not just shown in their
    // own separate "by sport" section.
    getOpinions(10),
    Promise.all(leagues.map(async (league) => [league.code, await getStandings(league.code)] as const)),
    Promise.all(leagues.map(async (league) => [league.code, await getTopScorers(league.code)] as const)),
    // The home page only reads the shared live cache. This prevents crawlers
    // and ordinary news-page traffic from spending the free API quota or
    // extending a provider rate-limit window.
    getLiveMatches(0),
  ]);
  const articles = articleRows.map(toPreview);
  const tables = Object.fromEntries(standings);
  const scorerTables = Object.fromEntries(scorers);
  // Merge articles and opinions chronologically (real timestamps, not the
  // already-formatted HH:MM display strings) so Armenian Football/Sport
  // pieces show up interleaved in the headline feed by actual recency,
  // not bucketed separately.
  const combinedFeed = [
    ...articleRows.map((a) => ({ publishedAt: a.publishedAt, preview: toPreview(a) })),
    ...opinionRowsForFeed.map((o) => ({ publishedAt: o.publishedAt, preview: opinionToPreview(o) })),
  ].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
  const headlineStream = combinedFeed.slice(0, 9).map((entry) => entry.preview);
  // Infinite-scroll pagination (HeadlineFeed's "load more") only continues
  // from the articles table via /api/articles?offset=N, so the starting
  // offset must count only the actual articles among the first 9 shown -
  // not the total including any opinions mixed in - or subsequent pages
  // would skip or repeat articles.
  const articlesInHeadline = headlineStream.filter((item) => item.basePath !== "/opinions").length;
  const heroArticles = articles.slice(0, 6);
  const sportSectionsData = await Promise.all(homepageSports.map(async (sport) => {
    if (sport.source === "opinions") {
      const rows = await getOpinions(4, sport.opinionCategory);
      return { name: sport.name, slug: sport.slug, href: `/opinions?category=${encodeURIComponent(sport.opinionCategory)}`, basePath: "/opinions", items: rows.map(opinionToPreview) };
    }
    const rows = await getArticlesByCategory(sport.dbCategory, 4);
    return { name: sport.name, slug: sport.slug, href: `/category/${sport.slug}`, basePath: "/news", items: rows.map(toPreview) };
  }));
  const sportSections = sportSectionsData;

  const homeJsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://aifootball.am/#organization",
        name: "AIFootball",
        url: "https://aifootball.am",
        logo: { "@type": "ImageObject", url: "https://aifootball.am/favicon.svg" },
      },
      {
        "@type": "WebSite",
        "@id": "https://aifootball.am/#website",
        name: "AIFootball",
        url: "https://aifootball.am",
        inLanguage: "hy",
        publisher: { "@id": "https://aifootball.am/#organization" },
        potentialAction: {
          "@type": "SearchAction",
          target: "https://aifootball.am/search?q={search_term_string}",
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };

  return (
    <main className="aisport-site">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(homeJsonLd) }} />
      <SiteHeader />
      <AdSpaces />

      <section className="live-ribbon" aria-label="Ուղիղ արդյունքներ">
        <div className="site-shell live-ribbon-inner">
          <Link className="live-title" href="/live"><span /> LIVE</Link>
          <div className="live-ticker"><div className="live-ticker-track">{[...live.matches, ...live.matches].map((match, index) => <Link className="live-ribbon-match" href={`/?match=${match.id}`} scroll={false} prefetch={false} key={`${match.id}-${index}`}><small className={match.isLive ? "ticker-live" : ""}>{match.status}</small><strong>{match.home}</strong><b>{match.homeScore ?? "–"}</b><span>:</span><b>{match.awayScore ?? "–"}</b><strong>{match.away}</strong></Link>)}</div></div>
          <Link className="all-scores" href="/live">Բոլոր խաղերը →</Link>
        </div>
      </section>

      <div className="site-shell home-main">
        <section className="trending-bar" aria-label="Թրենդային թեմաներ"><strong>Թրենդային</strong>{trendingTopics.map((topic) => <Link prefetch={false} href={`/search?q=${encodeURIComponent(topic.query)}`} key={topic.label}>{topic.label}</Link>)}</section>

        <section className="hero-news-grid newsroom-hero">
          <aside className="headline-feed" aria-label="Լրահոս">
            <header>
              <div className="feed-globe" aria-hidden="true">◎</div>
              <div><small>24/7 թարմացվող</small><h2>Լրահոս</h2></div>
              <Link href="/search">Բոլորը →</Link>
            </header>
            <HeadlineFeed initialArticles={headlineStream} initialOffset={articlesInHeadline} />
          </aside>
          <HeroCarousel articles={heroArticles} />
        </section>

        <div className="content-with-sidebar">
          <section className="latest-news-section" id="latest">
            <div className="modern-section-head"><div><span>Գլխավոր թեմաները</span><h2>Վերջին լուրերը՝ ըստ մարզաձևի</h2></div><Link href="/search">Դիտել բոլորը →</Link></div>
            <div className="sport-news-sections">
              {sportSections.filter((sport) => sport.items.length > 0).map((sport) => <section className="sport-news-block" key={sport.slug}>
                <div className="sport-news-head"><div><span /> <h3>{sport.name}</h3></div><Link href={sport.href}>Բոլոր լուրերը →</Link></div>
                <div className="sport-news-grid">
                  {sport.items.map((article, index) => <article className={index === 0 ? "sport-news-card featured" : "sport-news-card"} key={article.slug}>
                    <Link className="sport-news-image" href={`${sport.basePath}/${article.slug}`}><img src={sizedImage(article.image, 420)} alt="" referrerPolicy="no-referrer" loading="lazy" decoding="async" /></Link>
                    <div><span>{article.category}</span><h4><Link href={`${sport.basePath}/${article.slug}`}>{article.title}</Link></h4>{index === 0 ? <p>{article.excerpt}</p> : null}<time>{article.time} · {article.readTime}</time></div>
                  </article>)}
                </div>
              </section>)}
            </div>
          </section>

          <aside className="news-sidebar">
            <section className="sidebar-block live-card-block">
              <div className="sidebar-title"><div><span className="live-pulse" />Այսօր՝ ուղիղ</div><Link href="/live">Բոլորը</Link></div>
              <div className={live.unavailable ? "live-source-strip demo" : "live-source-strip real"}>{live.unavailable ? "Live տվյալները ժամանակավորապես անհասանելի են" : "Իրական live տվյալներ"}</div>
              {!live.matches.length && live.unavailable ? <div className="no-matches">Կեղծ հաշիվներ չենք ցուցադրում․ իրական տվյալները շուտով կվերականգնվեն։</div> : null}
              {live.matches.slice(0, 3).map((match) => <div className="score-card" key={match.id}><div><span>{match.competition}</span><b>{match.status}</b></div><p><strong className="team-with-logo">{match.homeLogo&&<img src={sizedImage(match.homeLogo, 24)} alt="" className="team-logo" loading="lazy" />}{match.home}</strong><b>{match.homeScore ?? "–"}</b></p><p><strong className="team-with-logo">{match.awayLogo&&<img src={sizedImage(match.awayLogo, 24)} alt="" className="team-logo" loading="lazy" />}{match.away}</strong><b>{match.awayScore ?? "–"}</b></p></div>)}
            </section>
            <section className="sidebar-block standings-block">
              <div className="sidebar-title"><div>Թոփ 5 առաջնություններ</div><Link href="/standings">Լրիվ</Link></div>
              <LeagueTabs tables={tables} topScorerTables={scorerTables} compact />
            </section>
            <section className="telegram-card"><span>➤</span><div><strong>AIFootball-ը Telegram-ում</strong><p>Թարմ լուրերը ստացեք առաջինը</p></div><button type="button">Միանալ</button></section>
          </aside>
        </div>

        <section className="newsletter-panel"><div><span>Ամենակարևորն՝ առանց աղմուկի</span><h2>AIFootball շաբաթական</h2><p>Շաբաթվա լավագույն նյութերն ու գլխավոր պատմությունները՝ ձեր էլ․ հասցեին։</p></div><form><input type="email" aria-label="Էլեկտրոնային հասցե" placeholder="email@example.com" /><button type="submit">Բաժանորդագրվել</button></form></section>
      </div>
      <AdSpaces bottom />
      <SiteFooter />
      <Suspense fallback={null}><MatchModal /></Suspense>
    </main>
  );
}
