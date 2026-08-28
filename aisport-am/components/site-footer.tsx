import Link from "next/link";
import { categories } from "../lib/content";

export function SiteFooter() {
  return (
    <footer className="new-footer">
      <div className="site-shell footer-main">
        <div>
          <Link prefetch={false} className="aisport-logo footer-logo" href="/"><span className="aisport-symbol">AI</span><strong>FOOTBALL</strong><i>AM</i></Link>
          <p>Միջազգային ֆուտբոլի և հայկական սպորտի արագ, խորքային և վստահելի լուսաբանում։</p>
        </div>
        <div><strong>Մարզաձևեր</strong>{categories.slice(0, 4).map((category) => <Link prefetch={false} href={`/category/${category.slug}`} key={category.slug}>{category.name}</Link>)}</div>
        <div><strong>AIFootball</strong><Link prefetch={false} href="/armenia">Հայկական սպորտ</Link><Link prefetch={false} href="/podcasts">Փոդքաստներ</Link><Link prefetch={false} href="/standings">Աղյուսակներ</Link><Link prefetch={false} href="/live">Live</Link><Link prefetch={false} href="/opinions">Հեղինակային նյութեր</Link></div>
        <div><strong>Հետևեք մեզ</strong><span>Facebook</span><span>Instagram</span><span>Telegram</span><span>Threads</span></div>
      </div>
      <div className="site-shell footer-bottom"><span>© 2026 AIFootball</span><span>Բովանդակության օգտագործումը՝ սկզբնաղբյուրի հղումով</span><span><Link prefetch={false} href="/privacy">Գաղտնիության քաղաքականություն</Link> · <Link prefetch={false} href="/terms">Օգտագործման կանոններ</Link></span></div>
    </footer>
  );
}
