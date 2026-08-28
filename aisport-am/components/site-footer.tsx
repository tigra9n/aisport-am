import Link from "next/link";

const footerSports = [
  { name: "Միջազգային ֆուտբոլ", href: "/league/PL" },
  { name: "Հայկական ֆուտբոլ", href: "/opinions?category=Հայկական+ֆուտբոլ" },
  { name: "Հայկական սպորտ", href: "/opinions?category=Հայկական+սպորտ" },
  { name: "Չեմպիոնների լիգա", href: "/league/CL" },
  { name: "Շախմատ", href: "/category/chess" },
];

export function SiteFooter() {
  return (
    <footer className="new-footer">
      <div className="site-shell footer-main">
        <div>
          <Link prefetch={false} className="aisport-logo footer-logo" href="/"><span className="aisport-symbol">AI</span><strong>FOOTBALL</strong><i>AM</i></Link>
          <p>Միջազգային ֆուտբոլի և հայկական սպորտի արագ, խորքային և վստահելի լուսաբանում։</p>
        </div>
        <div><strong>Մարզաձևեր</strong>{footerSports.map((sport) => <Link prefetch={false} href={sport.href} key={sport.href}>{sport.name}</Link>)}</div>
        <div><strong>AIFootball</strong><Link prefetch={false} href="/podcasts">Փոդքաստներ</Link><Link prefetch={false} href="/standings">Աղյուսակներ</Link><Link prefetch={false} href="/live">Live</Link><Link prefetch={false} href="/opinions">Հեղինակային նյութեր</Link></div>
        <div><strong>Հետևեք մեզ</strong><span>Facebook</span><span>Instagram</span><span>Telegram</span><span>Threads</span></div>
      </div>
      <div className="site-shell footer-bottom"><span>© 2026 AIFootball</span><span>Բովանդակության օգտագործումը՝ սկզբնաղբյուրի հղումով</span><span><Link prefetch={false} href="/privacy">Գաղտնիության քաղաքականություն</Link> · <Link prefetch={false} href="/terms">Օգտագործման կանոններ</Link></span></div>
    </footer>
  );
}
