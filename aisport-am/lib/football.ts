export type StandingRow = {
  position: number;
  team: string;
  teamId: number | null;
  // ESPN's own id under an "espn-" prefix. The two providers number clubs
  // differently and a bare number cannot say which is meant, so the prefix
  // is the difference: teamId is API-Football's, teamKey is ESPN's, and a
  // link prefers whichever the row actually has.
  teamKey?: string | null;
  teamLogo: string | null;
  played: number;
  won: number;
  draw: number;
  lost: number;
  goalDifference: number;
  points: number;
};

export const leagues = [
  { code: "CL", short: "ՉԼ", name: "Չեմպիոնների լիգա", country: "Եվրոպա" },
  { code: "EL", short: "ԵԼ", name: "Եվրոպա լիգա", country: "Եվրոպա" },
  { code: "ECL", short: "Կոնֆերենցիա", name: "Կոնֆերենցիայի լիգա", country: "Եվրոպա" },
  { code: "PL", short: "ԱՊԼ", name: "Պրեմիեր լիգա", country: "Անգլիա" },
  { code: "PD", short: "Լա Լիգա", name: "Լա Լիգա", country: "Իսպանիա" },
  { code: "SA", short: "Սերիա Ա", name: "Սերիա Ա", country: "Իտալիա" },
  { code: "BL1", short: "Բունդեսլիգա", name: "Բունդեսլիգա", country: "Գերմանիա" },
  { code: "FL1", short: "Լիգա 1", name: "Լիգա 1", country: "Ֆրանսիա" },
  { code: "SPL", short: "Սաուդյան լիգա", name: "Սաուդյան Արաբիայի պրոֆեսիոնալ լիգա", country: "Սաուդյան Արաբիա" },
  { code: "MLS", short: "MLS", name: "MLS", country: "ԱՄՆ" },
  { code: "ARM", short: "Հայաստանի Պրեմիեր լիգա", name: "Հայաստանի Պրեմիեր լիգա", country: "Հայաստան" },
];

const teams: Record<string, string[]> = {
  PL: ["Արսենալ", "Մանչեսթեր Սիթի", "Լիվերպուլ", "Չելսի", "Տոտենհեմ", "Նյուքասլ", "Մանչեսթեր Յունայթեդ", "Բրայթոն", "Աստոն Վիլա", "Վեսթ Հեմ", "Քրիսթալ Փելաս", "Բորնմութ", "Ֆուլհեմ", "Բրենթֆորդ", "Էվերթոն", "Վուլվերհեմփթոն", "Նոթինգհեմ Ֆորեսթ", "Լիդս", "Բարնլի", "Սանդերլենդ"],
  PD: ["Ռեալ Մադրիդ", "Բարսելոնա", "Ատլետիկո", "Աթլետիկ Բիլբաո", "Վիլյառեալ", "Բետիս", "Սևիլյա", "Ժիրոնա", "Վալենսիա", "Ռեալ Սոսիեդադ", "Սելտա", "Օսասունա", "Խետաֆե", "Մալյորկա", "Ռայո Վալեկանո", "Էսպանյոլ", "Ալավես", "Էլչե", "Լևանտե", "Օվիեդո"],
  SA: ["Ինտեր", "Նապոլի", "Միլան", "Յուվենտուս", "Ռոմա", "Ատալանտա", "Լացիո", "Բոլոնիա", "Ֆիորենտինա", "Տորինո", "Կոմո", "Ջենոա", "Ուդինեզե", "Կալյարի", "Պարմա", "Լեչչե", "Կրեմոնեզե", "Պիզա", "Սասուոլո", "Վերոնա"],
  BL1: ["Բավարիա", "Բորուսիա Դ.", "Բայեր", "Լայպցիգ", "Այնտրախտ", "Ֆրայբուրգ", "Շտուտգարտ", "Վոլֆսբուրգ", "Մայնց", "Վերդեր", "Հոֆենհայմ", "Ունիոն Բեռլին", "Աուգսբուրգ", "Բորուսիա Մ.", "Սանկտ Պաուլի", "Քյոլն", "Համբուրգ", "Հայդենհայմ"],
  FL1: ["ՊՍԺ", "Մարսել", "Մոնակո", "Լիլ", "Լիոն", "Նիցցա", "Լանս", "Ռեն", "Ստրասբուրգ", "Նանտ", "Թուլուզ", "Օսեր", "Բրեստ", "Լը Հավր", "Անժե", "Մեց", "Լորյան", "Փարիզ ՖԿ"],
};

export function demoStandings(code: string): StandingRow[] {
  // Only for a league this file has clubs for. It used to fall back to the
  // Premier League's twenty, so any competition without a list of its own -
  // the Saudi league, MLS, Armenia, and now the European cups - would have
  // shown Arsenal and Manchester City under its own name the moment the
  // real table could not be fetched. An empty table says "not now"; that
  // one said something false.
  if (!teams[code]) return [];
  return (teams[code] ?? teams.PL).map((team, index) => ({
    position: index + 1,
    team,
    teamId: null,
    teamLogo: null,
    played: 4,
    won: Math.max(0, 4 - Math.floor(index / 2)),
    draw: index % 3,
    lost: Math.floor(index / 3),
    goalDifference: 11 - index * 2,
    points: Math.max(3, 12 - index),
  }));
}
