"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { formatLongDateHy } from "../lib/format-date";

const dropdownItems = [
  { label: "Գլխավոր", href: "/", children: [["Վերջին լուրեր", "/#latest"], ["Live", "/live"], ["Փոդքաստներ", "/podcasts"]] },
  { label: "Լիգաներ", href: null, children: [
    ["Պրեմիեր լիգա", "/league/PL"],
    ["Լա Լիգա", "/league/PD"],
    ["Սերիա Ա", "/league/SA"],
    ["Բունդեսլիգա", "/league/BL1"],
    ["Լիգա 1", "/league/FL1"],
    ["Սաուդյան լիգա", "/league/SPL"],
    ["MLS", "/league/MLS"],
    ["Աղյուսակներ", "/standings"],
  ] },
];

// Simple top-level links, no dropdown - each already points to one clear
// destination, so a whole dropdown arrow/menu per item was unnecessary
// clutter (and extra surface area for hover-reliability issues).
const plainLinks = [
  { label: "Չեմպիոնների լիգա", href: "/league/CL" },
  { label: "Եվրոպա լիգա", href: "/league/EL" },
  { label: "Կոնֆերենցիա լիգա", href: "/league/ECL" },
  { label: "Հայկական ֆուտբոլ", href: "/opinions?category=Հայկական+ֆուտբոլ" },
  { label: "Հայկական սպորտ", href: "/opinions?category=Հայկական+սպորտ" },
  { label: "Շախմատ", href: "/category/chess" },
  { label: "Esport", href: "/search?q=Էսպորտ" },
];

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  // Explicit JS-controlled hover state instead of relying solely on CSS
  // :hover matching against native <details> semantics, which wasn't
  // reliably triggering the dropdown on plain mouse-over - opening now
  // only requires moving the pointer onto the item, no click needed.
  const [openLabel, setOpenLabel] = useState<string | null>(null);

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
          <span>{formatLongDateHy(new Date())}</span>
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
            {dropdownItems.map((item) => <details
              className="nav-section-menu"
              key={item.label}
              open={openLabel === item.label}
              onMouseEnter={() => setOpenLabel(item.label)}
              onMouseLeave={() => setOpenLabel((current) => (current === item.label ? null : current))}
              onToggle={(event) => { if (!event.currentTarget.open && openLabel === item.label) setOpenLabel(null); }}
            >
              <summary onClick={(event) => { event.preventDefault(); setOpenLabel((current) => (current === item.label ? null : item.label)); }}>
                {item.href ? <Link prefetch={false} href={item.href} onClick={(event) => { event.stopPropagation(); setMenuOpen(false); }}>{item.label}</Link> : <span>{item.label}</span>}
                <span>⌄</span>
              </summary>
              <div>{item.children.map(([label, href]) => <Link href={href} key={href} onClick={() => setMenuOpen(false)}>{label}</Link>)}</div>
            </details>)}
            {plainLinks.map((item) => <Link className="nav-plain-link" prefetch={false} href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</Link>)}
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
