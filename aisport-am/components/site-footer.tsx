import { activeProfiles } from "../lib/social";
import Link from "next/link";
import { BrandLogo } from "./brand-logo";

const footerSports = [
  { name: "Միջազգային ֆուտբոլ", href: "/league/PL" },
  { name: "Հայկական ֆուտբոլ", href: "/opinions?category=Հայկական+ֆուտբոլ" },
  { name: "Հայկական սպորտ", href: "/opinions?category=Հայկական+սպորտ" },
  { name: "Չեմպիոնների լիգա", href: "/league/CL" },
  { name: "Շախմատ", href: "/category/chess" },
];

export function SiteFooter() {
  // Only the accounts that actually exist - see lib/social.ts.
  const profiles = activeProfiles();

  return (
    <footer className="new-footer">
      <div className="site-shell footer-main">
        <div>
          <Link prefetch={false} className="aisport-logo footer-logo" href="/" aria-label="AIFootball գլխավոր էջ"><BrandLogo idSuffix="f" /></Link>
          <p>Միջազգային ֆուտբոլի և հայկական սպորտի արագ, խորքային և վստահելի լուսաբանում։</p>
        </div>
        <div><strong>Մարզաձևեր</strong>{footerSports.map((sport) => <Link prefetch={false} href={sport.href} key={sport.href}>{sport.name}</Link>)}</div>
        <div><strong>AIFootball</strong><Link prefetch={false} href="/podcasts">Փոդքաստներ</Link><Link prefetch={false} href="/standings">Աղյուսակներ</Link><Link prefetch={false} href="/live">Live</Link><Link prefetch={false} href="/opinions">Հեղինակային նյութեր</Link></div>
        {profiles.length > 0 && (
          <div><strong>Հետևեք մեզ</strong>{profiles.map((profile) => (
            <a href={profile.url} target="_blank" rel="noopener noreferrer" key={profile.key}>{profile.label}</a>
          ))}</div>
        )}
      </div>
      <div className="site-shell footer-bottom"><span>© 2026 AIFootball</span><span>Բովանդակության օգտագործումը՝ սկզբնաղբյուրի հղումով</span><span><Link prefetch={false} href="/about">Մեր մասին</Link> · <Link prefetch={false} href="/editorial">Խմբագրական սկզբունքներ</Link> · <Link prefetch={false} href="/contact">Կապ</Link> · <Link prefetch={false} href="/privacy">Գաղտնիության քաղաքականություն</Link> · <Link prefetch={false} href="/terms">Օգտագործման կանոններ</Link></span></div>
    </footer>
  );
}
