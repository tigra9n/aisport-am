import type { Metadata } from "next";
import Link from "next/link";
import { TopScorersTabs } from "../../components/top-scorers-tabs";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { leagues } from "../../lib/football";
import { getTopScorers } from "../../lib/topscorers-server";

export const metadata: Metadata = {
  title: "Ռմբարկուներ — եվրագավաթներ և առաջնություններ | AIFootball.am",
  description: "Անգլիայի, Իսպանիայի, Իտալիայի, Գերմանիայի և Ֆրանսիայի ֆուտբոլային առաջնությունների սեզոնի լավագույն ռմբարկուները՝ գոլերով և փոխանցումներով։",
  alternates: { canonical: "https://aifootball.am/topscorers" },
};

export const dynamic = "force-dynamic";

export default async function TopScorersPage() {
  const entries = await Promise.all(leagues.map(async (league) => [league.code, await getTopScorers(league.code)] as const));
  return <main><SiteHeader /><div className="site-shell inner-page">
    <span className="page-kicker">Եվրոպական ֆուտբոլ</span><h1 className="page-title">Ռմբարկուներ</h1><p className="page-intro">Ընտրեք առաջնությունը և դիտեք սեզոնի լավագույն ռմբարկուներին՝ գոլերով, փոխանցումներով և խաղացած խաղերով։ <Link href="/standings">Դիտել աղյուսակները →</Link></p>
    <section className="full-standings-card"><TopScorersTabs tables={Object.fromEntries(entries)} /></section>
  </div><SiteFooter /></main>;
}
