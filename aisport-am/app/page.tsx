/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { Suspense } from "react";
import { LeagueTabs } from "../components/league-tabs";
import { SiteFooter } from "../components/site-footer";
import { SiteHeader } from "../components/site-header";
import { HeroCarousel } from "../components/hero-carousel";
import { AdSpaces } from "../components/ad-spaces";
import { MatchModal } from "../components/match-modal";
import { demoArticles, opinions, trendingTopics, type ArticlePreview } from "../lib/content";
import { leagues } from "../lib/football";
import { getStandings } from "../lib/football-server";
import { getLiveMatches } from "../lib/live-football-server";
import { getPublishedArticles } from "../lib/articles";

// The live-score request must run in the production Worker. Without this,
// the page can be prerendered at deploy time and never reach the live API.
export const dynamic = "force-dynamic";

const homepageSports = [
  { name: "Հայկական սպորտ", category: "Հայկական սպորտ", slug: "armenia", href: "/armenia" },
  { name: "Ֆուտբոլ", slug: "football" },
  { name: "Բասկետբոլ", slug: "basketball" },
  { name: "Թենիս", slug: "tennis" },
  { name: "Ֆորմուլա 1", slug: "formula-1" },
  { name: "MMA", slug: "mma" },
  { name: "Բռնցքամարտ", slug: "boxing" },
  { name: "Ծանրամարտ", slug: "weightlifting" },
  { name: "Ըմբշամարտ", slug: "wrestling" },
  { name: "Մարմնամարզություն", slug: "gymnastics" },
];

async function homepageArticles(): Promise<ArticlePreview[]> {
  const stored = await getPublishedArticles(20);
  if (!stored.length) return demoArticles;
  return stored.map((article, index) => ({
    slug: article.slug,
    category: article.category,
    title: article.title,
    excerpt: article.excerpt,
    author: "AISport խմբագրություն",
    time: new Date(article.publishedAt).toLocaleString("hy-AM", { hour: "2-digit", minute: "2-digit" }),
    readTime: "3 րոպե",
    image: article.imageUrl || demoArticles[index % demoArticles.length].image,
    local: article.category.includes("Հայաստան"),
    featured: index === 0,
  }));
}

export default async function Home() {
  const [articles, standings, live] = await Promise.all([
    homepageArticles(),
    Promise.all(leagues.map(async (league) => [league.code, await getStandings(league.code)] as const)),
    // The home page only reads the shared live cache. This prevents crawlers
    // and ordinary news-page traffic from spending the free API quota or
    // extending a provider rate-limit window.
    getLiveMatches(0),
  ]);
  const tables = Object.fromEntries(standings);
  const headlineStream = articles.slice(1, 10);
  const heroArticles = articles.slice(0, 6);
  const sportSections = homepageSports.map((sport) => {
    const seen = new Set<string>();
    const items = [...articles, ...demoArticles].filter((article) => {
      const matches = sport.slug === "armenia" ? article.local : article.category === sport.name;
      if (!matches || seen.has(article.slug)) return false;
      seen.add(article.slug);
      return true;
    }).slice(0, 4);
    return { ...sport, href: sport.href ?? `/category/${sport.slug}`, items };
  });

  return (
    <main className="aisport-site">
      <SiteHeader />
      <AdSpaces />

      <section className="live-ribbon" aria-label="Ուղիղ արդյունքներ">
        <div className="site-shell live-ribbon-inner">
          <Link className="live-title" href="/live"><span /> LIVE</Link>
          <div className="live-ticker"><div className="live-ticker-track">{[...live.matches, ...live.matches].map((match, index) => <Link className="live-ribbon-match" href={`/?match=${match.id}`} scroll={false} key={`${match.id}-${index}`}><small className={match.isLive ? "ticker-live" : ""}>{match.status}</small><strong>{match.home}</strong><b>{match.homeScore ?? "–"}</b><span>:</span><b>{match.awayScore ?? "–"}</b><strong>{match.away}</strong></Link>)}</div></div>
          <Link className="all-scores" href="/live">Բոլոր խաղերը →</Link>
        </div>
      </section>

      <div className="site-shell home-main">
        <section className="trending-bar" aria-label="Թրենդային թեմաներ"><strong>Թրենդային</strong>{trendingTopics.map((topic) => <Link href={`/search?q=${encodeURIComponent(topic.slice(1))}`} key={topic}>{topic}</Link>)}</section>

        <section className="hero-news-grid newsroom-hero">
          <aside className="headline-feed" aria-label="Լրահոս">
            <header>
              <div className="feed-globe" aria-hidden="true">◎</div>
              <div><small>24/7 թարմացվող</small><h2>Լրահոս</h2></div>
              <Link href="/search">Բոլորը →</Link>
            </header>
            <div className="headline-feed-list">
              {headlineStream.map((article) => <Link className="headline-feed-item" href={`/news/${article.slug}`} key={article.slug}>
                <img src={article.image} alt="" />
                <div><span>{article.category}</span><h3>{article.title}</h3><time>{article.time}</time></div>
              </Link>)}
            </div>
          </aside>
          <HeroCarousel articles={heroArticles} />
        </section>

        <div className="content-with-sidebar">
          <section className="latest-news-section" id="latest">
            <div className="modern-section-head"><div><span>Գլխավոր թեմաները</span><h2>Վերջին լուրերը՝ ըստ մարզաձևի</h2></div><Link href="/search">Դիտել բոլորը →</Link></div>
            <div className="sport-news-sections">
              {sportSections.map((sport) => <section className="sport-news-block" key={sport.slug}>
                <div className="sport-news-head"><div><span /> <h3>{sport.name}</h3></div><Link href={sport.href}>Բոլոր լուրերը →</Link></div>
                <div className="sport-news-grid">
                  {sport.items.map((article, index) => <article className={index === 0 ? "sport-news-card featured" : "sport-news-card"} key={article.slug}>
                    <Link className="sport-news-image" href={`/news/${article.slug}`}><img src={article.image} alt="" /></Link>
                    <div><span>{article.category}</span><h4><Link href={`/news/${article.slug}`}>{article.title}</Link></h4>{index === 0 ? <p>{article.excerpt}</p> : null}<time>{article.time} · {article.readTime}</time></div>
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
              {live.matches.slice(0, 3).map((match) => <div className="score-card" key={match.id}><div><span>{match.competition}</span><b>{match.status}</b></div><p><strong>{match.home}</strong><b>{match.homeScore ?? "–"}</b></p><p><strong>{match.away}</strong><b>{match.awayScore ?? "–"}</b></p></div>)}
            </section>
            <section className="sidebar-block standings-block">
              <div className="sidebar-title"><div>Թոփ 5 առաջնություններ</div><Link href="/standings">Լրիվ</Link></div>
              <LeagueTabs tables={tables} compact />
            </section>
            <section className="telegram-card"><span>➤</span><div><strong>AISport-ը Telegram-ում</strong><p>Թարմ լուրերը ստացեք առաջինը</p></div><button type="button">Միանալ</button></section>
          </aside>
        </div>

        <section className="opinions-section">
          <div className="modern-section-head"><div><span>Խմբագրական տեսակետ</span><h2>Հեղինակային նյութեր</h2></div><Link href="/opinions">Բոլոր նյութերը →</Link></div>
          <div className="opinion-grid">{opinions.map((opinion) => <article key={opinion.title}><div className="opinion-avatar">{opinion.initials}</div><div><span>{opinion.role}</span><h3><Link href="/opinions">{opinion.title}</Link></h3><p>{opinion.author}</p></div><b>↗</b></article>)}</div>
        </section>

        <section className="newsletter-panel"><div><span>Ամենակարևորն՝ առանց աղմուկի</span><h2>AISport շաբաթական</h2><p>Շաբաթվա լավագույն նյութերն ու գլխավոր պատմությունները՝ ձեր էլ․ հասցեին։</p></div><form><input type="email" aria-label="Էլեկտրոնային հասցե" placeholder="email@example.com" /><button type="submit">Բաժանորդագրվել</button></form></section>
      </div>
      <AdSpaces bottom />
      <SiteFooter />
      <Suspense fallback={null}><MatchModal /></Suspense>
    </main>
  );
}
