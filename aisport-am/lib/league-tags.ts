// Detects which league an article belongs to, based on club and
// competition keywords appearing in its (already-Armenian) title and
// content. This replaces relying on free-text /search?q= filtering for
// the nav's league links, which just did a generic keyword search across
// ALL articles rather than a real per-article classification - a "Premier
// League" search could surface an article that only mentions the league
// name in passing, or miss one that's clearly about a Premier League club
// but never says "Պրեմիեր լիգա" verbatim.
//
// Keywords are the Armenian team/competition names already used
// throughout the site (see lib/team-names-hy.ts), so matching against the
// generated Armenian text works directly without needing a second
// English-name lookup layer.

export const LEAGUE_TAGS = [
  { code: "PL", label: "Պրեմիեր լիգա" },
  { code: "PD", label: "Լա Լիգա" },
  { code: "SA", label: "Սերիե Ա" },
  { code: "BL1", label: "Բունդեսլիգա" },
  { code: "FL1", label: "Լիգա 1" },
  { code: "SPL", label: "Սաուդյան լիգա" },
  { code: "MLS", label: "MLS" },
  { code: "CL", label: "Չեմպիոնների լիգա" },
  { code: "EL", label: "Եվրոպա լիգա" },
  { code: "ECL", label: "Կոնֆերենցիա լիգա" },
  { code: "INTL", label: "Միջազգային ֆուտբոլ" },
] as const;

export type LeagueCode = typeof LEAGUE_TAGS[number]["code"];

// Competition-name keywords checked first - if the text explicitly names
// a competition, that's a stronger signal than an incidental club mention
// (e.g. a Champions League preview mentioning several PL and PD clubs
// should tag as CL, not whichever club happens to appear first).
const COMPETITION_KEYWORDS: [RegExp, LeagueCode][] = [
  [/չեմպիոնների\s*լիգ/i, "CL"],
  [/եվրոպա\s*լիգ/i, "EL"],
  [/կոնֆերենցիա\s*լիգ/i, "ECL"],
  [/պրեմիեր\s*լիգ/i, "PL"],
  [/լա\s*լիգ/i, "PD"],
  [/սերիե\s*ա/i, "SA"],
  [/բունդեսլիգ/i, "BL1"],
  [/(ֆրանսիայի\s*)?լիգա\s*1/i, "FL1"],
  [/սաուդյան.*(լիգ|արաբիա)/i, "SPL"],
  [/\bmls\b/i, "MLS"],
];

// Club-name keywords per league - covers the clubs most likely to appear
// in generated content (the trusted-domain whitelist's outlets cover top
// clubs most heavily). Not exhaustive; unmatched clubs fall through to
// INTL rather than a wrong guess.
const CLUB_KEYWORDS: [RegExp, LeagueCode][] = [
  // Premier League
  [/արսենալ|աստոն\s*վիլ|բորնմութ|բրենթֆորդ|բրայթոն|չելսի|քրիսթալ\s*փելաս|էվերթոն|ֆուլհեմ|լիվերպուլ|մանչեսթեր\s*սիթի|մանչեսթեր\s*յունայթեդ|նյուքասլ|նոթինգհեմ\s*ֆորեսթ|տոտենհեմ|վոլվերհեմփթոն|հալ\s*սիթի|լիդս|սանդերլենդ|քովենթրի/i, "PL"],
  // La Liga
  [/ռեալ\s*մադրիդ|բարսելոն|ատլետիկո\s*մադրիդ|սևիլիա|վալենսիա|վիլյառեալ|ալավես|ռեալ\s*սոսիեդադ|աթլետիկ\s*բիլբաո|ժիրոնա|ռասինգ\s*սանտանդեր|էլչե/i, "PD"],
  // Serie A
  [/յուվենտուս|միլան\b|ինտեր\b|նապոլի|ռոմա\b|լացիո|ատալանտա|ֆիորենտինա|կալիարի/i, "SA"],
  // Bundesliga
  [/բավարիա|բորուսիա\s*դորտմունդ|լայպցիգ|այնտրախտ|վերդեր|վոլֆսբուրգ|շտուտգարտ|շալկե/i, "BL1"],
  // Ligue 1
  [/ՊՍԺ|պարիզեն|մարսել|լիոն\b|մոնակո|լիլ\b|ռեն\b|ստրասբուրգ/i, "FL1"],
  // Saudi Pro League
  [/ալ-հիլալ|ալ-նասր|ալ-իթթիհադ|ալ-ահլի|ալ-ֆաթեհ|ալ-շաբաբ|ալ-թաավուն|ալ-խալիջ|ալ-ռիյադ|ալ-ֆայհա/i, "SPL"],
  // MLS
  [/ինտեր\s*մայամի|լոս\s*անջելես\s*գալաքսի|լոս\s*անջելես\s*ֆԿ|սիեթլ\s*սաունդերս|նյու\s*յորք\s*սիթի|նյու\s*յորք\s*ռեդ\s*բուլզ/i, "MLS"],
];

// National-team / general football keywords that should never be
// mistaken for a club competition.
const NATIONAL_TEAM_KEYWORDS = /հավաքական|ազգային\s*թիմ|world\s*cup|աշխարհի\s*առաջնություն/i;

export function detectLeague(title: string, content: string, category: string): LeagueCode | null {
  if (!category.includes("Ֆուտբոլ")) return null;
  const text = `${title} ${content}`;

  // "Հայաստանի Պրեմիեր լիգա" (Armenian Premier League) would otherwise
  // false-match the English Premier League's "Պրեմիեր լիգա" keyword.
  const isArmenianPremierLeague = /հայաստանի\s*պրեմիեր\s*լիգ/i.test(text);

  for (const [pattern, code] of COMPETITION_KEYWORDS) {
    if (code === "PL" && isArmenianPremierLeague) continue;
    if (pattern.test(text)) return code;
  }
  for (const [pattern, code] of CLUB_KEYWORDS) {
    if (pattern.test(text)) return code;
  }
  if (NATIONAL_TEAM_KEYWORDS.test(text)) return "INTL";
  // Football article with no specific league/club/competition match -
  // still tag as INTL rather than leaving it unclassified, so every
  // football article shows up somewhere in the league-filtered views.
  return "INTL";
}
