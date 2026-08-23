"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const navigation = [
  { label: "Գլխավոր", href: "/", children: [["Վերջին լուրեր", "/#latest"], ["Live", "/live"], ["Փոդքաստներ", "/podcasts"]] },
  { label: "Հայաստան", href: "/armenia", children: [["Հավաքականներ", "/search?q=Հայաստանի+հավաքական"], ["Ակումբներ", "/search?q=հայկական+ակումբներ"], ["Հայ մարզիկներ", "/search?q=հայ+մարզիկներ"]] },
  { label: "Ֆուտբոլ", href: "/category/football", children: [["Չեմպիոնների լիգա", "/search?q=Չեմպիոնների+լիգա"], ["Թոփ 5 լիգաներ", "/standings"], ["Գոլահարվածներ", "/topscorers"], ["Տրանսֆերներ", "/search?q=տրանսֆերներ"]] },
  { label: "Բասկետբոլ", href: "/category/basketball", children: [["NBA", "/search?q=NBA"], ["Եվրալիգա", "/search?q=Եվրալիգա"], ["Հայաստան", "/search?q=Հայաստանի+բասկետբոլ"]] },
  { label: "Թենիս", href: "/category/tennis", children: [["ATP", "/search?q=ATP"], ["WTA", "/search?q=WTA"], ["Մեծ սաղավարտ", "/search?q=Մեծ+սաղավարտ"]] },
  { label: "Ֆորմուլա 1", href: "/category/formula-1", children: [["Մրցարշավներ", "/search?q=Ֆորմուլա+1"], ["Վարկանիշ", "/search?q=Ֆորմուլա+1+վարկանիշ"], ["Թիմեր", "/search?q=Ֆորմուլա+1+թիմեր"]] },
  { label: "MMA", href: "/category/mma", children: [["UFC", "/search?q=UFC"], ["Հայ մարտիկներ", "/search?q=հայ+MMA+մարտիկներ"], ["Մենամարտերի օրացույց", "/search?q=MMA+մենամարտեր"]] },
  { label: "Բռնցքամարտ", href: "/category/boxing", children: [["Հայ բռնցքամարտիկներ", "/search?q=հայ+բռնցքամարտիկներ"], ["Պրոֆեսիոնալ ռինգ", "/search?q=պրոֆեսիոնալ+բռնցքամարտ"], ["Մենամարտեր", "/search?q=բռնցքամարտի+մենամարտեր"]] },
  { label: "Ծանրամարտ", href: "/category/weightlifting", children: [["Հայաստանի հավաքական", "/search?q=Հայաստանի+ծանրամարտի+հավաքական"], ["Եվրոպայի առաջնություն", "/search?q=ծանրամարտի+Եվրոպայի+առաջնություն"], ["Աշխարհի առաջնություն", "/search?q=ծանրամարտի+Աշխարհի+առաջնություն"]] },
  { label: "Ըմբշամարտ", href: "/category/wrestling", children: [["Ազատ ոճ", "/search?q=ազատ+ոճի+ըմբշամարտ"], ["Հունահռոմեական", "/search?q=հունահռոմեական+ըմբշամարտ"], ["Հայ ըմբիշներ", "/search?q=հայ+ըմբիշներ"]] },
  { label: "Մարմնամարզություն", href: "/category/gymnastics", children: [["Հայ մարմնամարզիկներ", "/search?q=հայ+մարմնամարզիկներ"], ["Աշխարհի գավաթ", "/search?q=մարմնամարզության+Աշխարհի+գավաթ"], ["Առաջնություններ", "/search?q=մարմնամարզության+առաջնություն"]] },
];

const moreNavigation = [
  ["Շախմատ", "/category/chess"],
  ["Հեղինակային նյութեր", "/opinions"],
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("aisport-theme");
    const shouldUseDark = saved !== "light";
    document.documentElement.dataset.theme = shouldUseDark ? "dark" : "light";
    const frame = requestAnimationFrame(() => setDark(shouldUseDark));
    return () => cancelAnimationFrame(frame);
  }, []);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? "dark" : "light";
    localStorage.setItem("aisport-theme", next ? "dark" : "light");
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    const input = event.currentTarget.elements.namedItem("q") as HTMLInputElement;
    if (!input.value.trim()) event.preventDefault();
  }

  return (
    <>
      <div className="topline">
        <div className="site-shell topline-inner">
          <span>{new Intl.DateTimeFormat("hy-AM", { timeZone: "Asia/Yerevan", day: "numeric", month: "long", weekday: "long" }).format(new Date())}</span>
          <div><Link prefetch={false} href="/podcasts">Փոդքաստներ</Link><span>·</span><Link prefetch={false} href="/control">Խմբագրություն</Link></div>
        </div>
      </div>
      <header className="main-header">
        <div className="site-shell brand-row">
          <button className="icon-button mobile-menu-button" type="button" aria-label="Բացել մենյուն" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>☰</button>
          <Link prefetch={false} className="aisport-logo" href="/" aria-label="AISport գլխավոր էջ">
            <span className="aisport-symbol">AI</span><strong>SPORT</strong><i>AM</i>
          </Link>
          <p className="brand-line">Սպորտը՝ արագ, խելացի, հայերեն</p>
          <div className="header-actions">
            <button className="icon-button" type="button" aria-label="Որոնում" onClick={() => setSearchOpen(!searchOpen)}>⌕</button>
            <button className="icon-button" type="button" aria-label="Փոխել գունային ռեժիմը" onClick={toggleTheme}>{dark ? "☀" : "◐"}</button>
          </div>
        </div>
        <div className={`nav-wrap ${menuOpen ? "open" : ""}`}>
          <nav className="site-shell primary-nav" aria-label="Հիմնական բաժիններ">
            {navigation.map((item) => <details className="nav-section-menu" key={item.href}><summary><Link prefetch={false} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link><span>⌄</span></summary><div>{item.children.map(([label, href]) => <Link prefetch={false} href={href} key={href} onClick={() => setMenuOpen(false)}>{label}</Link>)}</div></details>)}
            <Link className="podcast-nav-button" prefetch={false} href="/podcasts" onClick={() => setMenuOpen(false)}><span>◉</span> Փոդքաստ</Link>
            <details className="nav-more-menu">
              <summary>Ավելին <span aria-hidden="true">⌄</span></summary>
              <div>
                {moreNavigation.map(([label, href]) => <Link prefetch={false} href={href} key={href} onClick={() => setMenuOpen(false)}>{label}{href === "/live" ? <span className="nav-live-dot" /> : null}</Link>)}
              </div>
            </details>
          </nav>
        </div>
        {searchOpen ? (
          <div className="header-search-wrap">
            <form className="site-shell header-search" action="/search" onSubmit={submitSearch}>
              <label htmlFor="header-q">Որոնել AISport-ում</label>
              <input id="header-q" name="q" autoFocus placeholder="Թիմ, մարզիկ, մրցաշար…" />
              <button type="submit">Որոնել</button>
            </form>
          </div>
        ) : null}
      </header>
    </>
  );
}
