import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { getOpinions } from "../../lib/opinions";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function OpinionsPage() {
  const opinions = await getOpinions(30);
  return <main><SiteHeader /><div className="site-shell inner-page"><span className="page-kicker">Խմբագրական տեսակետ</span><h1 className="page-title">Հեղինակային նյութեր</h1><p className="page-intro">Փորձագիտական տեսակետներ, տակտիկական դիտարկումներ և հայկական սպորտի խորքային պատմություններ։</p>{opinions.length > 0 ? <section className="opinion-grid" style={{marginTop:32}}>{opinions.map((opinion) => <article key={opinion.slug}><div className="opinion-avatar">{opinion.initials}</div><div><span>{opinion.role}</span><h3><Link href={`/opinions/${opinion.slug}`}>{opinion.title}</Link></h3><p>{opinion.author}</p></div><b>↗</b></article>)}</section> : <p className="empty-state" style={{marginTop:32}}>Դեռ նյութեր չկան։</p>}</div><SiteFooter /></main>;
}
