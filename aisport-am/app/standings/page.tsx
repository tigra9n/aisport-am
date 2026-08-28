import type { Metadata } from "next";
import Link from "next/link";
import { LeagueTabs } from "../../components/league-tabs";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { leagues } from "../../lib/football";
import { getStandings } from "../../lib/football-server";
import { getTopScorers } from "../../lib/topscorers-server";

export const metadata: Metadata = {
  title: "Աղյուսակներ — Թոփ 5 առաջնություններ | AIFootball.am",
  description: "Անգլիայի, Իսպանիայի, Իտալիայի, Գերմանիայի և Ֆրանսիայի ֆուտբոլային առաջնությունների թարմ աղյուսակներն ու ռմբարկուների ցուցակները։",
  alternates: { canonical: "https://aisport.am/standings" },
};

export default async function StandingsPage() {
  const [standingsEntries, scorerEntries] = await Promise.all([
    Promise.all(leagues.map(async (league) => [league.code, await getStandings(league.code)] as const)),
    Promise.all(leagues.map(async (league) => [league.code, await getTopScorers(league.code)] as const)),
  ]);
  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Եվրոպական ֆուտբոլ</span><h1 className="page-title">Թոփ 5 առաջնություններ</h1><p className="page-intro">Ընտրեք առաջնությունը և անցեք Աղյուսակ/Ռմբարկուներ միջև՝ ուղիղ ներքևի կոճակներով, առանց էջ փոխելու։ <Link href="/topscorers">Ամբողջական ռմբարկուների ցուցակը →</Link></p>
    <section className="full-standings-card"><LeagueTabs tables={Object.fromEntries(standingsEntries)} topScorerTables={Object.fromEntries(scorerEntries)} /></section>
  </div><SiteFooter /></main>;
}
