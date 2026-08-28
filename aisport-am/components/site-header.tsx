"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const navigation = [
  { label: "Գլխավոր", href: "/", children: [["Վերջին լուրեր", "/#latest"], ["Live", "/live"], ["Փոդքաստներ", "/podcasts"]] },
  { label: "Լիգաներ", href: null, children: [
    ["Պրեմիեր լիգա", "/search?q=Պրեմիեր+լիգա"],
    ["Լա Լիգա", "/search?q=Լա+Լիգա"],
    ["Սերիե Ա", "/search?q=Սերիե+Ա"],
    ["Բունդեսլիգա", "/search?q=Բունդեսլիգա"],
    ["Լիգա 1", "/search?q=Լիգա+1"],
    ["Սաուդյան լիգա", "/search?q=Սաուդյան+Արաբիա"],
    ["MLS", "/search?q=MLS"],
    ["Աղյուսակներ", "/standings"],
  ] },
  { label: "Չեմպիոնների լիգա", href: "/search?q=Չեմպիոնների+լիգա", children: [["Լուրեր", "/search?q=Չեմպիոնների+լիգա"], ["Աղյուսակներ", "/standings"]] },
  { label: "Եվրոպա լիգա", href: "/search?q=Եվրոպա+լիգա", children: [["Լուրեր", "/search?q=Եվրոպա+լիգա"]] },
  { label: "Կոնֆերենցիա լիգա", href: "/search?q=Կոնֆերենցիա+լիգա", children: [["Լուրեր", "/search?q=Կոնֆերենցիա+լիգա"]] },
  { label: "Հայկական ֆուտբոլ", href: "/opinions?category=Հայկական+ֆուտբոլ", children: [["Հեղինակային նյութեր", "/opinions?category=Հայկական+ֆուտբոլ"], ["Հայաստանի Պրեմիեր լիգա", "/standings"], ["Լուրեր", "/search?q=Հայաստանի+ֆուտբոլ"]] },
  { label: "Հայկական սպորտ", href: "/opinions?category=Հայկական+սպորտ", children: [["Հեղինակային նյութեր", "/opinions?category=Հայկական+սպորտ"], ["Հայ մարզիկներ", "/search?q=հայ+մարզիկներ"]] },
  { label: "Շախմատ", href: "/category/chess", children: [["Լուրեր", "/category/chess"], ["Հայ շախմատիստներ", "/search?q=հայ+շախմատիստներ"]] },
  { label: "Էսպորտ", href: "/search?q=Էսպորտ", children: [["Լուրեր", "/search?q=Էսպորտ"], ["Հայ խաղացողներ", "/search?q=հայ+էսպորտ"]] },
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
          <Link prefetch={false} className="aisport-logo" href="/" aria-label="AIFootball գլխավոր էջ">
            <span className="aisport-symbol">AI</span><strong>FOOTBALL</strong><i>AM</i>
          </Link>
          <p className="brand-line">Ֆուտբոլը՝ արագ, խելացի, հայերեն</p>
          <div className="header-actions">
            <button className="icon-button" type="button" aria-label="Որոնում" onClick={() => setSearchOpen(!searchOpen)}>⌕</button>
            <button className="icon-button" type="button" aria-label="Փոխել գունային ռեժիմը" onClick={toggleTheme}>{dark ? "☀" : "◐"}</button>
          </div>
        </div>
        <div className={`nav-wrap ${menuOpen ? "open" : ""}`}>
          <nav className="site-shell primary-nav" aria-label="Հիմնական բաժիններ">
            {navigation.map((item) => <details className="nav-section-menu" key={item.label}><summary>{item.href ? <Link prefetch={false} href={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link> : <span>{item.label}</span>}<span>⌄</span></summary><div>{item.children.map(([label, href]) => <Link prefetch={false} href={href} key={href} onClick={() => setMenuOpen(false)}>{label}</Link>)}</div></details>)}
            <Link className="podcast-nav-button" prefetch={false} href="/podcasts" onClick={() => setMenuOpen(false)}><span>◉</span> Փոդքաստ</Link>
          </nav>
        </div>
        {searchOpen ? (
          <div className="header-search-wrap">
            <form className="site-shell header-search" action="/search" onSubmit={submitSearch}>
              <label htmlFor="header-q">Որոնել AIFootball-ում</label>
              <input id="header-q" name="q" autoFocus placeholder="Թիմ, մարզիկ, մրցաշար…" />
              <button type="submit">Որոնել</button>
            </form>
          </div>
        ) : null}
      </header>
    </>
  );
}
