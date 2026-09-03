// Football named-entity list for APITube's rss source, per user-provided
// config (apitube-football-entities-v1.json).
//
// Live testing found that organization.name (clubs) and event.name
// (competitions) both return "entity not found" (ER0220/ER0228) for
// essentially every name tried, including extremely famous ones
// ("Manchester United", "UEFA Champions League") - APITube's entity
// taxonomy doesn't appear to cover football clubs/competitions this way.
//
// person.name DOES work for players/coaches (confirmed real results for
// Lionel Messi, Henrikh Mkhitaryan), and a plain title= free-text search
// works well for clubs (confirmed 5 real, on-topic results for
// title=Real Madrid) - clubs just aren't in the tagged-entity taxonomy,
// but their names obviously appear in article titles. Both query one
// name/club at a time (no chunking) since a comma-separated
// person.name list fails entirely if even one name isn't recognized.

export type EntityClass = "person.name" | "title";

type Entity = { name: string; priority: 100 | 90 | 80 | 70; section: string };

// How many Armenians-abroad to put at the head of a search attempt. They
// lead every attempt rather than waiting their turn, but not all of them
// at once: an attempt only tries fifteen entities in total, and eight
// names that happen to have no news today would eat half that budget and
// cost the site its publishing rate. Three lead, the rest sit at the end
// of the chain where they are still reachable if nothing else answers.
const ABROAD_PER_ATTEMPT = 3;

const CLUBS: Entity[] = [
  { name: "FC Noah", priority: 100, section: "armenia" },
  { name: "FC Pyunik", priority: 100, section: "armenia" },
  { name: "FC Ararat-Armenia", priority: 100, section: "armenia" },
  { name: "FC Urartu", priority: 100, section: "armenia" },
  { name: "FC Alashkert", priority: 100, section: "armenia" },
  { name: "FC Ararat", priority: 100, section: "armenia" },
  { name: "FC Shirak", priority: 100, section: "armenia" },
  { name: "FC Van", priority: 100, section: "armenia" },
  { name: "FC BKMA", priority: 100, section: "armenia" },
  { name: "FC Gandzasar", priority: 100, section: "armenia" },
  { name: "FC Syunik", priority: 100, section: "armenia" },
  { name: "Sardarapat FC", priority: 100, section: "armenia" },

  { name: "Real Madrid", priority: 90, section: "europe" },
  { name: "FC Barcelona", priority: 90, section: "europe" },
  { name: "Atletico Madrid", priority: 90, section: "europe" },
  { name: "Manchester City", priority: 90, section: "europe" },
  { name: "Manchester United", priority: 90, section: "europe" },
  { name: "Liverpool FC", priority: 90, section: "europe" },
  { name: "Arsenal FC", priority: 90, section: "europe" },
  { name: "Chelsea FC", priority: 90, section: "europe" },
  { name: "Paris Saint-Germain", priority: 90, section: "europe" },
  { name: "Bayern Munich", priority: 90, section: "europe" },
  { name: "Borussia Dortmund", priority: 90, section: "europe" },
  { name: "Inter Milan", priority: 90, section: "europe" },
  { name: "AC Milan", priority: 90, section: "europe" },
  { name: "Juventus FC", priority: 90, section: "europe" },

  { name: "Athletic Bilbao", priority: 80, section: "europe" },
  { name: "Sevilla FC", priority: 80, section: "europe" },
  { name: "Villarreal CF", priority: 80, section: "europe" },
  { name: "Tottenham Hotspur", priority: 80, section: "europe" },
  { name: "Newcastle United", priority: 80, section: "europe" },
  { name: "Aston Villa", priority: 80, section: "europe" },
  { name: "Olympique de Marseille", priority: 80, section: "europe" },
  { name: "AS Monaco", priority: 80, section: "europe" },
  { name: "Bayer Leverkusen", priority: 80, section: "europe" },
  { name: "RB Leipzig", priority: 80, section: "europe" },
  { name: "SSC Napoli", priority: 80, section: "europe" },
  { name: "AS Roma", priority: 80, section: "europe" },
  { name: "Atalanta BC", priority: 80, section: "europe" },
  { name: "SL Benfica", priority: 80, section: "europe" },
  { name: "FC Porto", priority: 80, section: "europe" },
  { name: "Sporting CP", priority: 80, section: "europe" },
  { name: "AFC Ajax", priority: 80, section: "europe" },

  { name: "Olympique Lyonnais", priority: 70, section: "europe" },
  { name: "Eintracht Frankfurt", priority: 70, section: "europe" },
  { name: "SS Lazio", priority: 70, section: "europe" },
  { name: "PSV Eindhoven", priority: 70, section: "europe" },
  { name: "Feyenoord", priority: 70, section: "europe" },
  { name: "Olympiacos FC", priority: 70, section: "europe" },
  { name: "Celtic FC", priority: 70, section: "europe" },
  { name: "Rangers FC", priority: 70, section: "europe" },
  { name: "Shakhtar Donetsk", priority: 70, section: "europe" },
  { name: "Dynamo Kyiv", priority: 70, section: "europe" },
  { name: "Qarabag FK", priority: 70, section: "europe" },

  // Expanded per explicit request - many more clubs across more leagues,
  // to give the entity-search pool a much wider surface area to find
  // fresh, non-duplicate content from at any given moment.
  { name: "West Ham United", priority: 70, section: "europe" },
  { name: "Brighton & Hove Albion", priority: 70, section: "europe" },
  { name: "Crystal Palace", priority: 70, section: "europe" },
  { name: "Everton FC", priority: 70, section: "europe" },
  { name: "Fulham FC", priority: 70, section: "europe" },
  { name: "Wolverhampton Wanderers", priority: 70, section: "europe" },
  { name: "Nottingham Forest", priority: 70, section: "europe" },
  { name: "Brentford FC", priority: 70, section: "europe" },
  { name: "Real Sociedad", priority: 70, section: "europe" },
  { name: "Real Betis", priority: 70, section: "europe" },
  { name: "Valencia CF", priority: 70, section: "europe" },
  { name: "Girona FC", priority: 70, section: "europe" },
  { name: "Fiorentina", priority: 70, section: "europe" },
  { name: "Torino FC", priority: 70, section: "europe" },
  { name: "Bologna FC", priority: 70, section: "europe" },
  { name: "Udinese Calcio", priority: 70, section: "europe" },
  { name: "VfB Stuttgart", priority: 70, section: "europe" },
  { name: "SC Freiburg", priority: 70, section: "europe" },
  { name: "1. FC Union Berlin", priority: 70, section: "europe" },
  { name: "Borussia Monchengladbach", priority: 70, section: "europe" },
  { name: "VfL Wolfsburg", priority: 70, section: "europe" },
  { name: "Stade Rennais", priority: 70, section: "europe" },
  { name: "OGC Nice", priority: 70, section: "europe" },
  { name: "RC Lens", priority: 70, section: "europe" },
  { name: "Stade de Reims", priority: 70, section: "europe" },
  { name: "AZ Alkmaar", priority: 70, section: "europe" },
  { name: "FC Twente", priority: 70, section: "europe" },
  { name: "Club Brugge", priority: 70, section: "europe" },
  { name: "Anderlecht", priority: 70, section: "europe" },
  { name: "FC Basel", priority: 70, section: "europe" },
  { name: "Red Bull Salzburg", priority: 70, section: "europe" },
  { name: "Slavia Prague", priority: 70, section: "europe" },
  { name: "Dinamo Zagreb", priority: 70, section: "europe" },

  { name: "Al Hilal", priority: 70, section: "world" },
  { name: "Al Nassr", priority: 70, section: "world" },
  { name: "Al Ittihad", priority: 70, section: "world" },
  { name: "Al Ahli Saudi", priority: 70, section: "world" },
  { name: "Inter Miami", priority: 70, section: "world" },
  { name: "LA Galaxy", priority: 70, section: "world" },
  { name: "LAFC", priority: 70, section: "world" },
  { name: "Flamengo", priority: 70, section: "world" },
  { name: "Palmeiras", priority: 70, section: "world" },
  { name: "River Plate", priority: 70, section: "world" },
  { name: "Boca Juniors", priority: 70, section: "world" },
];

const PERSONS: Entity[] = [
  { name: "Henrikh Mkhitaryan", priority: 100, section: "armenia-abroad" },
  { name: "Eduard Spertsyan", priority: 100, section: "armenia-abroad" },
  { name: "Nair Tiknizyan", priority: 100, section: "armenia-abroad" },
  { name: "Lucas Zelarayan", priority: 100, section: "armenia-abroad" },
  { name: "Grant-Leon Ranos", priority: 100, section: "armenia-abroad" },
  { name: "Vahan Bichakhchyan", priority: 100, section: "armenia-abroad" },
  { name: "Edgar Sevikyan", priority: 100, section: "armenia-abroad" },
  { name: "Tigran Barseghyan", priority: 100, section: "armenia-abroad" },
  { name: "Artur Serobyan", priority: 100, section: "armenia" },
  { name: "Zhirayr Shaghoyan", priority: 100, section: "armenia" },
  { name: "Narek Grigoryan", priority: 100, section: "armenia" },
  { name: "Narek Aghasaryan", priority: 100, section: "armenia" },
  { name: "Ugochukwu Iwu", priority: 100, section: "armenia" },
  { name: "Styopa Mkrtchyan", priority: 100, section: "armenia" },
  { name: "Georgii Arutiunian", priority: 100, section: "armenia" },
  { name: "Sergey Muradyan", priority: 100, section: "armenia" },
  { name: "Erik Piloyan", priority: 100, section: "armenia" },
  { name: "Kamo Hovhannisyan", priority: 100, section: "armenia" },
  { name: "Ognjen Cancarevic", priority: 100, section: "armenia" },
  { name: "Henri Avagyan", priority: 100, section: "armenia" },
  { name: "Arsen Beglaryan", priority: 100, section: "armenia" },
  { name: "Yeghishe Melikyan", priority: 100, section: "armenia" },

  { name: "Kylian Mbappe", priority: 90, section: "world" },
  { name: "Lamine Yamal", priority: 90, section: "world" },
  { name: "Erling Haaland", priority: 90, section: "world" },
  { name: "Vinicius Junior", priority: 90, section: "world" },
  { name: "Jude Bellingham", priority: 90, section: "world" },
  { name: "Mohamed Salah", priority: 90, section: "world" },
  { name: "Harry Kane", priority: 90, section: "world" },
  { name: "Lionel Messi", priority: 90, section: "world" },
  { name: "Cristiano Ronaldo", priority: 90, section: "world" },
  { name: "Julian Alvarez", priority: 90, section: "world" },
  { name: "Kevin De Bruyne", priority: 90, section: "world" },
  { name: "Neymar", priority: 90, section: "world" },
  { name: "Rodri", priority: 80, section: "world" },
  { name: "Pedri", priority: 80, section: "world" },
  { name: "Gavi", priority: 80, section: "world" },
  { name: "Raphinha", priority: 80, section: "world" },
  { name: "Robert Lewandowski", priority: 80, section: "world" },
  { name: "Florian Wirtz", priority: 80, section: "world" },
  { name: "Jamal Musiala", priority: 80, section: "world" },
  { name: "Bukayo Saka", priority: 80, section: "world" },
  { name: "Cole Palmer", priority: 80, section: "world" },
  { name: "Declan Rice", priority: 80, section: "world" },
  { name: "Phil Foden", priority: 80, section: "world" },
  { name: "Alexander Isak", priority: 80, section: "world" },
  { name: "Ousmane Dembele", priority: 80, section: "world" },
  { name: "Khvicha Kvaratskhelia", priority: 80, section: "world" },
  { name: "Achraf Hakimi", priority: 80, section: "world" },
  { name: "Lautaro Martinez", priority: 80, section: "world" },
  { name: "Nico Williams", priority: 80, section: "world" },
  { name: "Dani Olmo", priority: 80, section: "world" },
  { name: "Federico Valverde", priority: 80, section: "world" },
  { name: "Trent Alexander-Arnold", priority: 80, section: "world" },
  { name: "Antoine Griezmann", priority: 80, section: "world" },
  { name: "Martin Odegaard", priority: 80, section: "world" },
  { name: "Bruno Fernandes", priority: 80, section: "world" },
  { name: "Alisson Becker", priority: 70, section: "world" },
  { name: "Thibaut Courtois", priority: 70, section: "world" },
  { name: "Virgil van Dijk", priority: 70, section: "world" },
  { name: "William Saliba", priority: 70, section: "world" },
  { name: "Victor Osimhen", priority: 70, section: "world" },
  { name: "Viktor Gyokeres", priority: 70, section: "world" },
  { name: "Benjamin Sesko", priority: 70, section: "world" },

  // Expanded per explicit request - many more players across more clubs
  // and leagues, to give the entity-search pool a much wider surface
  // area to find fresh, non-duplicate content from at any given moment.
  { name: "Marcus Rashford", priority: 70, section: "world" },
  { name: "Kai Havertz", priority: 70, section: "world" },
  { name: "Gabriel Jesus", priority: 70, section: "world" },
  { name: "Ivan Toney", priority: 70, section: "world" },
  { name: "James Maddison", priority: 70, section: "world" },
  { name: "Morgan Gibbs-White", priority: 70, section: "world" },
  { name: "Anthony Gordon", priority: 70, section: "world" },
  { name: "Eberechi Eze", priority: 70, section: "world" },
  { name: "Moises Caicedo", priority: 70, section: "world" },
  { name: "Enzo Fernandez", priority: 70, section: "world" },
  { name: "Mason Mount", priority: 70, section: "world" },
  { name: "Jarrod Bowen", priority: 70, section: "world" },
  { name: "Kaoru Mitoma", priority: 70, section: "world" },
  { name: "Antony", priority: 70, section: "world" },
  { name: "Rasmus Hojlund", priority: 70, section: "world" },
  { name: "Joao Felix", priority: 70, section: "world" },
  { name: "Nicolas Jackson", priority: 70, section: "world" },
  { name: "Ansu Fati", priority: 70, section: "world" },
  { name: "Ferran Torres", priority: 70, section: "world" },
  { name: "Alvaro Morata", priority: 70, section: "world" },
  { name: "Antoine Semenyo", priority: 70, section: "world" },
  { name: "Mateo Retegui", priority: 70, section: "world" },
  { name: "Dusan Vlahovic", priority: 70, section: "world" },
  { name: "Nicolo Barella", priority: 70, section: "world" },
  { name: "Federico Chiesa", priority: 70, section: "world" },
  { name: "Marcus Thuram", priority: 70, section: "world" },
  { name: "Serhou Guirassy", priority: 70, section: "world" },
  { name: "Leroy Sane", priority: 70, section: "world" },
  { name: "Jonathan Tah", priority: 70, section: "world" },
  { name: "Ilkay Gundogan", priority: 70, section: "world" },
  { name: "Joshua Kimmich", priority: 70, section: "world" },
  { name: "Manuel Neuer", priority: 70, section: "world" },
  { name: "Ousmane Dembele Jr", priority: 70, section: "world" },
  { name: "Randal Kolo Muani", priority: 70, section: "world" },
  { name: "Bradley Barcola", priority: 70, section: "world" },
  { name: "Desire Doue", priority: 70, section: "world" },
  { name: "Warren Zaire-Emery", priority: 70, section: "world" },
  { name: "Jonathan David", priority: 70, section: "world" },
  { name: "Bafode Diakite", priority: 70, section: "world" },
  { name: "Bernardo Silva", priority: 70, section: "world" },
  { name: "Erling Braut Haaland", priority: 70, section: "world" },
  { name: "Jack Grealish", priority: 70, section: "world" },
  { name: "Ruben Dias", priority: 70, section: "world" },
  { name: "Kylian Mbappe Jr", priority: 70, section: "world" },
  { name: "Endrick", priority: 70, section: "world" },
  { name: "Arda Guler", priority: 70, section: "world" },
  { name: "Eduardo Camavinga", priority: 70, section: "world" },
  { name: "Aurelien Tchouameni", priority: 70, section: "world" },
  { name: "Toni Kroos", priority: 70, section: "world" },
  { name: "Luka Modric", priority: 70, section: "world" },

  { name: "Pep Guardiola", priority: 80, section: "coaches" },
  { name: "Mikel Arteta", priority: 80, section: "coaches" },
  { name: "Luis Enrique", priority: 80, section: "coaches" },
  { name: "Hansi Flick", priority: 80, section: "coaches" },
  { name: "Xabi Alonso", priority: 80, section: "coaches" },
  { name: "Arne Slot", priority: 80, section: "coaches" },
  { name: "Diego Simeone", priority: 70, section: "coaches" },
  { name: "Antonio Conte", priority: 70, section: "coaches" },
  { name: "Carlo Ancelotti", priority: 70, section: "coaches" },
  { name: "Jose Mourinho", priority: 70, section: "coaches" },
  { name: "Thomas Tuchel", priority: 70, section: "coaches" },
  { name: "Didier Deschamps", priority: 70, section: "coaches" },
  { name: "Lionel Scaloni", priority: 70, section: "coaches" },
  { name: "Erik ten Hag", priority: 70, section: "coaches" },
  { name: "Unai Emery", priority: 70, section: "coaches" },
  { name: "Roberto De Zerbi", priority: 70, section: "coaches" },
  { name: "Vincent Kompany", priority: 70, section: "coaches" },
  { name: "Julian Nagelsmann", priority: 70, section: "coaches" },
  { name: "Massimiliano Allegri", priority: 70, section: "coaches" },
  { name: "Simone Inzaghi", priority: 70, section: "coaches" },
  { name: "Sergio Conceicao", priority: 70, section: "coaches" },
  { name: "Ruben Amorim", priority: 70, section: "coaches" },
];

// Names/clubs that returned an "entity/value not found" error get pushed
// here at runtime and skipped for the rest of this invocation. Doesn't
// persist across invocations (Workers are stateless) - acceptable
// tradeoff over adding a D1 table just for this; a permanently-invalid
// value just gets retried occasionally instead of remembered forever.
const runtimeQuarantine = new Set<string>();
export function quarantineValue(name: string) {
  runtimeQuarantine.add(name);
}

// Shared priority-tier chain builder for a flat entity list: most-
// specific-due-tier first, falling back through the other tiers (tier
// 100 - Armenia - last, since APITube coverage of Armenian
// players/clubs is spottier than world-famous ones). The caller tries
// entries one at a time and stops at the first one that actually
// returns articles.
//
// tierCycle (hourly) controls which priority tiers are "due" this hour.
// rotationSeed is separate and finer-grained (minutes, not hours) - using
// only tierCycle for the starting offset meant repeated calls within the
// same hour (manual testing, or the native+backup cron systems both
// firing in the same throttle window) always picked the same starting
// entity, producing several near-duplicate articles about the same club
// in a row (observed: 3 Olympiacos articles in 10 minutes).
// BUG FIXED: this staggering created a real, hour-dependent "lucky
// window" pattern - correctly noticed live (success seemed to cluster
// around specific hours). With MAX_ENTITIES_PER_ATTEMPT capping how many
// entities actually get tried, a non-due tier 70 (the largest tier, most
// entities) could end up effectively unreachable within the cap whenever
// tiers 90+80 alone already filled the slots, meaning most hours never
// really searched tier 70 at all - only the ~1-in-8 hours where tier 70
// was "due" (and thus ordered first) got full access to it. Removed
// entirely now that the pool is much larger (~200 entities, was ~79):
// interleave all tiers with equal standing every attempt instead of
// favoring whichever tier happens to be "due" this hour.
function buildChain(entities: Entity[], _tierCycle: number, rotationSeed: number): string[] {
  const byTier: Record<100 | 90 | 80 | 70, string[]> = { 100: [], 90: [], 80: [], 70: [] };
  for (const e of entities) {
    if (runtimeQuarantine.has(e.name)) continue;
    // Armenian domestic football is excluded from AI-driven generation by
    // explicit request - Tigran writes the Armenian league himself, and
    // two authors covering the same match is worse than one. Only live
    // scores and the standings table (a separate pipeline) stay automatic.
    //
    // Armenians playing abroad are the exception, and are searched first:
    // Mkhitaryan at Inter or Spertsyan at Krasnodar are covered by the
    // international press the searches already read, so there is real
    // material for them, and they are the one subject this site can cover
    // in Armenian that nobody else does. They do not collide with what
    // Tigran writes, which is the domestic game.
    if (e.section === "armenia") continue;
    byTier[e.priority].push(e.name);
  }

  const rotate = (names: string[]) => {
    if (!names.length) return [];
    const start = rotationSeed % names.length;
    return names.map((_, i) => names[(start + i) % names.length]);
  };

  // Armenians abroad (tier 100) lead, but only ABROAD_PER_ATTEMPT of them;
  // the rotation moves which three across attempts, so all of them get
  // their turn over the course of a day.
  const abroad = rotate(byTier[100]);
  const chain: string[] = abroad.slice(0, ABROAD_PER_ATTEMPT);

  for (const tier of [90, 80, 70] as const) {
    for (const name of rotate(byTier[tier])) chain.push(name);
  }

  // The remaining Armenians sit at the tail rather than being dropped:
  // reachable when nothing ahead of them answered, which is exactly when
  // an extra try is worth making.
  chain.push(...abroad.slice(ABROAD_PER_ATTEMPT));
  return chain;
}

// The Armenians-abroad that lead this attempt, in the same rotation the
// chain builder uses so the two agree on whose turn it is.
function abroadLead(rotationSeed: number): string[] {
  const names = PERSONS
    .filter((e) => e.section === "armenia-abroad" && !runtimeQuarantine.has(e.name))
    .map((e) => e.name);
  if (!names.length) return [];
  const start = rotationSeed % names.length;
  return Array.from({ length: Math.min(ABROAD_PER_ATTEMPT, names.length) }, (_, i) => names[(start + i) % names.length]);
}

export function pickPersonQueryChain(cycle: number, rotationSeed: number = cycle): string[] {
  return buildChain(PERSONS, cycle, rotationSeed);
}

export function pickClubQueryChain(cycle: number, rotationSeed: number = cycle): string[] {
  return buildChain(CLUBS, cycle, rotationSeed);
}

// Alternates which type (club title-search vs person.name) gets tried
// first each cycle, with the other type as fallback, so both clubs and
// players get regular turns rather than one crowding out the other.
// rotationSeed should be a finer-grained value than the hourly cycle
// (e.g. total elapsed minutes) so repeated calls within the same hour
// don't all pick the same starting entity - see buildChain.
export function pickCombinedChain(cycle: number, rotationSeed: number = cycle): { filterType: EntityClass; value: string }[] {
  const persons = pickPersonQueryChain(cycle, rotationSeed).map((value) => ({ filterType: "person.name" as const, value }));
  const clubs = pickClubQueryChain(cycle, rotationSeed).map((value) => ({ filterType: "title" as const, value }));
  const rest = cycle % 2 === 0 ? [...clubs, ...persons] : [...persons, ...clubs];

  // Leading the persons chain is not enough. Half the cycles put the clubs
  // first, and a caller only tries the first fifteen entries - which on
  // those cycles would leave the Armenians sitting behind seventy clubs,
  // never reached. They lead the combined chain instead, on every cycle.
  const lead: { filterType: EntityClass; value: string }[] = abroadLead(rotationSeed)
    .map((value) => ({ filterType: "person.name" as const, value }));
  const seen = new Set(lead.map((pick) => pick.value));
  return [...lead, ...rest.filter((pick) => !seen.has(pick.value))];
}
