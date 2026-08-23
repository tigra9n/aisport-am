import Link from "next/link";
import { LeagueTabs } from "../../components/league-tabs";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { leagues } from "../../lib/football";
import { getStandings } from "../../lib/football-server";

export default async function StandingsPage() {
  const entries = await Promise.all(leagues.map(async (league) => [league.code, await getStandings(league.code)] as const));
  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Եվրոպական ֆուտբոլ</span><h1 className="page-title">Թոփ 5 առաջնություններ</h1><p className="page-intro">Ընտրեք առաջնությունը և դիտեք մրցաշարային ամբողջական աղյուսակը՝ խաղեր, հաղթանակներ, ոչ-ոքիներ, պարտություններ, գոլերի տարբերություն և միավորներ։ <Link href="/topscorers">Դիտել գոլահարվածներին →</Link></p>
    <section className="full-standings-card"><LeagueTabs tables={Object.fromEntries(entries)} /></section>
  </div><SiteFooter /></main>;
}
