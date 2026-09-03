// Country and competition names in Armenian.
//
// API-Football answers in English, and the site was printing that through
// untouched in some places and, worse, through the club transliterator in
// others - which turned the Spain national team into "Սպային", a word that
// means nothing in either language. Clubs live in team-names-hy.ts; this
// file covers the two other kinds of proper noun the API returns, and both
// are needed in several places at once (a player's nationality, a coach's
// nationality, a national team's name, a competition's name), so they
// belong in one shared module rather than being fixed page by page.

const COUNTRY_HY: Record<string, string> = {
  // Europe
  "spain": "Իսպանիա", "france": "Ֆրանսիա", "england": "Անգլիա", "germany": "Գերմանիա",
  "italy": "Իտալիա", "portugal": "Պորտուգալիա", "netherlands": "Նիդեռլանդներ",
  "holland": "Նիդեռլանդներ", "belgium": "Բելգիա", "croatia": "Խորվաթիա",
  "switzerland": "Շվեյցարիա", "austria": "Ավստրիա", "poland": "Լեհաստան",
  "denmark": "Դանիա", "sweden": "Շվեդիա", "norway": "Նորվեգիա", "finland": "Ֆինլանդիա",
  "iceland": "Իսլանդիա", "ireland": "Իռլանդիա", "republic of ireland": "Իռլանդիա",
  "northern ireland": "Հյուսիսային Իռլանդիա", "scotland": "Շոտլանդիա", "wales": "Ուելս",
  "greece": "Հունաստան", "turkey": "Թուրքիա", "türkiye": "Թուրքիա", "serbia": "Սերբիա",
  "czech republic": "Չեխիա", "czechia": "Չեխիա", "slovakia": "Սլովակիա",
  "slovenia": "Սլովենիա", "hungary": "Հունգարիա", "romania": "Ռումինիա",
  "bulgaria": "Բուլղարիա", "albania": "Ալբանիա", "kosovo": "Կոսովո",
  "bosnia and herzegovina": "Բոսնիա և Հերցեգովինա", "north macedonia": "Հյուսիսային Մակեդոնիա",
  "montenegro": "Չեռնոգորիա", "ukraine": "Ուկրաինա", "russia": "Ռուսաստան",
  "belarus": "Բելառուս", "moldova": "Մոլդովա", "estonia": "Էստոնիա", "latvia": "Լատվիա",
  "lithuania": "Լիտվա", "cyprus": "Կիպրոս", "malta": "Մալթա", "luxembourg": "Լյուքսեմբուրգ",
  "armenia": "Հայաստան", "georgia": "Վրաստան", "azerbaijan": "Ադրբեջան",
  "kazakhstan": "Ղազախստան", "israel": "Իսրայել",
  // Americas
  "brazil": "Բրազիլիա", "argentina": "Արգենտինա", "uruguay": "Ուրուգվայ",
  "colombia": "Կոլումբիա", "chile": "Չիլի", "peru": "Պերու", "ecuador": "Էկվադոր",
  "paraguay": "Պարագվայ", "bolivia": "Բոլիվիա", "venezuela": "Վենեսուելա",
  "usa": "ԱՄՆ", "united states": "ԱՄՆ", "canada": "Կանադա", "mexico": "Մեքսիկա",
  "costa rica": "Կոստա Ռիկա", "panama": "Պանամա", "jamaica": "Ճամայկա",
  "honduras": "Հոնդուրաս",
  // Africa
  "morocco": "Մարոկկո", "senegal": "Սենեգալ", "nigeria": "Նիգերիա", "ghana": "Գանա",
  "egypt": "Եգիպտոս", "algeria": "Ալժիր", "tunisia": "Թունիս", "cameroon": "Կամերուն",
  "ivory coast": "Կոտ դ'Իվուար", "côte d'ivoire": "Կոտ դ'Իվուար", "mali": "Մալի",
  "burkina faso": "Բուրկինա Ֆասո", "guinea": "Գվինեա", "gabon": "Գաբոն",
  "congo dr": "Կոնգոյի ԴՀ", "dr congo": "Կոնգոյի ԴՀ", "south africa": "Հարավային Աֆրիկա",
  "angola": "Անգոլա",
  // Asia and Oceania
  "japan": "Ճապոնիա", "south korea": "Հարավային Կորեա", "korea republic": "Հարավային Կորեա",
  "china": "Չինաստան", "australia": "Ավստրալիա", "new zealand": "Նոր Զելանդիա",
  "saudi arabia": "Սաուդյան Արաբիա", "qatar": "Կատար", "iran": "Իրան", "iraq": "Իրաք",
  "united arab emirates": "ԱՄԷ", "uae": "ԱՄԷ", "jordan": "Հորդանան", "syria": "Սիրիա",
  "uzbekistan": "Ուզբեկստան", "india": "Հնդկաստան",
  // Continents and confederations, used by qualifier stage names
  "europe": "Եվրոպա", "south america": "Հարավային Ամերիկա", "africa": "Աֆրիկա",
  "asia": "Ասիա", "north america": "Հյուսիսային Ամերիկա", "oceania": "Օվկիանիա",
  "concacaf": "ՀՅՈՒԱԿ", "world": "Աշխարհ",
};

const COMPETITION_HY: Record<string, string> = {
  // Domestic leagues
  "premier league": "Պրեմիեր լիգա", "la liga": "Լա Լիգա", "laliga": "Լա Լիգա",
  "serie a": "Սերիա Ա", "bundesliga": "Բունդեսլիգա", "ligue 1": "Լիգա 1",
  "primeira liga": "Պրիմեյրա լիգա", "liga portugal": "Պրիմեյրա լիգա",
  "eredivisie": "Էրեդիվիզի", "jupiler pro league": "Բելգիայի Պրո լիգա",
  "pro league": "Բելգիայի Պրո լիգա", "super lig": "Սուպեր լիգա", "süper lig": "Սուպեր լիգա",
  "saudi pro league": "Սաուդյան Պրո լիգա", "major league soccer": "MLS",
  "championship": "Չեմպիոնշիփ", "premier league armenia": "Հայաստանի պրեմիեր լիգա",
  "armenian premier league": "Հայաստանի պրեմիեր լիգա",
  // European club competitions
  "uefa champions league": "Չեմպիոնների լիգա", "champions league": "Չեմպիոնների լիգա",
  "uefa europa league": "Եվրոպա լիգա", "europa league": "Եվրոպա լիգա",
  "uefa europa conference league": "Կոնֆերենցիա լիգա",
  "uefa conference league": "Կոնֆերենցիա լիգա", "conference league": "Կոնֆերենցիա լիգա",
  "uefa super cup": "ՈՒԵՖԱ-ի Սուպերգավաթ",
  // National-team competitions
  "world cup": "Աշխարհի առաջնություն", "fifa world cup": "Աշխարհի առաջնություն",
  "euro championship": "Եվրոպայի առաջնություն", "uefa euro": "Եվրոպայի առաջնություն",
  "european championship": "Եվրոպայի առաջնություն",
  "uefa nations league": "Ազգերի լիգա", "nations league": "Ազգերի լիգա",
  "copa america": "Ամերիկայի գավաթ", "africa cup of nations": "Աֆրիկյան ազգերի գավաթ",
  "asian cup": "Ասիայի գավաթ", "friendlies": "Ընկերական խաղեր",
  "club world cup": "Ակումբների աշխարհի գավաթ",
  "fifa club world cup": "Ակումբների աշխարհի գավաթ",
  // Domestic cups
  "copa del rey": "Իսպանիայի գավաթ", "fa cup": "Անգլիայի գավաթ",
  "efl cup": "Անգլիայի լիգայի գավաթ", "carabao cup": "Անգլիայի լիգայի գավաթ",
  "league cup": "Լիգայի գավաթ", "coppa italia": "Իտալիայի գավաթ",
  "dfb pokal": "Գերմանիայի գավաթ", "coupe de france": "Ֆրանսիայի գավաթ",
  "knvb beker": "Նիդեռլանդների գավաթ", "taca de portugal": "Պորտուգալիայի գավաթ",
  "supercopa de espana": "Իսպանիայի Սուպերգավաթ",
  "supercoppa italiana": "Իտալիայի Սուպերգավաթ",
  "community shield": "Բարեգործական վահան", "super cup": "Սուպերգավաթ",
};

// API-Football writes competition names with assorted accents, dots and
// casing ("Süper Lig", "DFB Pokal", "Supercopa de España"), so compare on a
// stripped-down form rather than the literal string.
function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function armenianCountry(name: string | null | undefined): string {
  if (!name) return "";
  return COUNTRY_HY[normalise(name)] ?? name;
}

export function isKnownCountry(name: string | null | undefined): boolean {
  return !!name && normalise(name) in COUNTRY_HY;
}

export function armenianCompetition(name: string | null | undefined): string {
  if (!name) return "";
  const key = normalise(name);
  const direct = COMPETITION_HY[key];
  if (direct) return direct;

  // Qualifiers and regional stages arrive as "World Cup - Qualification
  // Europe" or "Euro Championship - Qualification". Translate the part
  // before the dash and mark it as a qualifier, rather than leaving the
  // whole string in English because the suffix was not in the table.
  const dash = key.split(" - ");
  if (dash.length > 1) {
    const base = COMPETITION_HY[dash[0]];
    if (base) {
      const rest = dash.slice(1).join(" - ");
      if (rest.startsWith("qualification")) {
        const region = rest.replace("qualification", "").trim();
        const regionHy = region ? armenianCountry(region) : "";
        return `${base}, որակավորում${regionHy && regionHy !== region ? ` (${regionHy})` : ""}`;
      }
      return base;
    }
  }
  return name;
}
