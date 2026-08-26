// Priority named-entity configuration for football news ingestion, per
// user-provided config (apitube-football-entities-v1.json). Focuses
// APITube's rss source specifically on football - named clubs, players,
// coaches, national teams and competitions - instead of the broad
// "everything tagged sport" category feed used before.

export type EntityClass = "organization.name" | "person.name" | "event.name";

type Entity = { name: string; priority: 100 | 90 | 80 | 70; section: string };

const ORGANIZATIONS: Entity[] = [
  { name: "Armenia national football team", priority: 100, section: "armenia" },
  { name: "Football Federation of Armenia", priority: 100, section: "armenia" },
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
  { name: "Athletic Bilbao", priority: 80, section: "europe" },
  { name: "Sevilla FC", priority: 80, section: "europe" },
  { name: "Villarreal CF", priority: 80, section: "europe" },
  { name: "Manchester City", priority: 90, section: "europe" },
  { name: "Manchester United", priority: 90, section: "europe" },
  { name: "Liverpool FC", priority: 90, section: "europe" },
  { name: "Arsenal FC", priority: 90, section: "europe" },
  { name: "Chelsea FC", priority: 90, section: "europe" },
  { name: "Tottenham Hotspur", priority: 80, section: "europe" },
  { name: "Newcastle United", priority: 80, section: "europe" },
  { name: "Aston Villa", priority: 80, section: "europe" },
  { name: "Paris Saint-Germain", priority: 90, section: "europe" },
  { name: "Olympique de Marseille", priority: 80, section: "europe" },
  { name: "AS Monaco", priority: 80, section: "europe" },
  { name: "Olympique Lyonnais", priority: 70, section: "europe" },
  { name: "Bayern Munich", priority: 90, section: "europe" },
  { name: "Borussia Dortmund", priority: 90, section: "europe" },
  { name: "Bayer Leverkusen", priority: 80, section: "europe" },
  { name: "RB Leipzig", priority: 80, section: "europe" },
  { name: "Eintracht Frankfurt", priority: 70, section: "europe" },
  { name: "Inter Milan", priority: 90, section: "europe" },
  { name: "AC Milan", priority: 90, section: "europe" },
  { name: "Juventus FC", priority: 90, section: "europe" },
  { name: "SSC Napoli", priority: 80, section: "europe" },
  { name: "AS Roma", priority: 80, section: "europe" },
  { name: "Atalanta BC", priority: 80, section: "europe" },
  { name: "SS Lazio", priority: 70, section: "europe" },
  { name: "SL Benfica", priority: 80, section: "europe" },
  { name: "FC Porto", priority: 80, section: "europe" },
  { name: "Sporting CP", priority: 80, section: "europe" },
  { name: "AFC Ajax", priority: 80, section: "europe" },
  { name: "PSV Eindhoven", priority: 70, section: "europe" },
  { name: "Feyenoord", priority: 70, section: "europe" },
  { name: "Galatasaray SK", priority: 80, section: "europe" },
  { name: "Fenerbahce SK", priority: 80, section: "europe" },
  { name: "Olympiacos FC", priority: 70, section: "europe" },
  { name: "Celtic FC", priority: 70, section: "europe" },
  { name: "Rangers FC", priority: 70, section: "europe" },
  { name: "FC Shakhtar Donetsk", priority: 70, section: "europe" },
  { name: "FC Dynamo Kyiv", priority: 70, section: "europe" },
  { name: "Qarabag FK", priority: 70, section: "europe" },

  { name: "Argentina national football team", priority: 80, section: "national-teams" },
  { name: "Spain national football team", priority: 80, section: "national-teams" },
  { name: "France national football team", priority: 80, section: "national-teams" },
  { name: "England national football team", priority: 80, section: "national-teams" },
  { name: "Brazil national football team", priority: 80, section: "national-teams" },
  { name: "Portugal national football team", priority: 80, section: "national-teams" },
  { name: "Germany national football team", priority: 80, section: "national-teams" },
  { name: "Italy national football team", priority: 80, section: "national-teams" },
  { name: "Netherlands national football team", priority: 70, section: "national-teams" },
  { name: "Belgium national football team", priority: 70, section: "national-teams" },
  { name: "Croatia national football team", priority: 70, section: "national-teams" },
  { name: "Uruguay national football team", priority: 70, section: "national-teams" },
  { name: "Morocco national football team", priority: 70, section: "national-teams" },
  { name: "Georgia national football team", priority: 70, section: "national-teams" },
];

const PERSONS: Entity[] = [
  { name: "Henrikh Mkhitaryan", priority: 100, section: "armenia" },
  { name: "Eduard Spertsyan", priority: 100, section: "armenia" },
  { name: "Nair Tiknizyan", priority: 100, section: "armenia" },
  { name: "Lucas Zelarayan", priority: 100, section: "armenia" },
  { name: "Grant-Leon Ranos", priority: 100, section: "armenia" },
  { name: "Vahan Bichakhchyan", priority: 100, section: "armenia" },
  { name: "Edgar Sevikyan", priority: 100, section: "armenia" },
  { name: "Tigran Barseghyan", priority: 100, section: "armenia" },
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
  { name: "Alisson Becker", priority: 70, section: "world" },
  { name: "Thibaut Courtois", priority: 70, section: "world" },
  { name: "Virgil van Dijk", priority: 70, section: "world" },
  { name: "William Saliba", priority: 70, section: "world" },
  { name: "Victor Osimhen", priority: 70, section: "world" },
  { name: "Viktor Gyokeres", priority: 70, section: "world" },
  { name: "Benjamin Sesko", priority: 70, section: "world" },

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
];

const EVENTS: Entity[] = [
  { name: "Armenian Premier League", priority: 100, section: "armenia" },
  { name: "Armenian Cup", priority: 100, section: "armenia" },
  { name: "UEFA Champions League", priority: 90, section: "europe" },
  { name: "UEFA Europa League", priority: 90, section: "europe" },
  { name: "UEFA Conference League", priority: 90, section: "europe" },
  { name: "Premier League", priority: 90, section: "england" },
  { name: "FA Cup", priority: 80, section: "england" },
  { name: "EFL Cup", priority: 70, section: "england" },
  { name: "La Liga", priority: 90, section: "spain" },
  { name: "Copa del Rey", priority: 80, section: "spain" },
  { name: "Serie A", priority: 90, section: "italy" },
  { name: "Coppa Italia", priority: 80, section: "italy" },
  { name: "Bundesliga", priority: 90, section: "germany" },
  { name: "DFB-Pokal", priority: 80, section: "germany" },
  { name: "Ligue 1", priority: 90, section: "france" },
  { name: "Coupe de France", priority: 80, section: "france" },
  { name: "FIFA World Cup", priority: 90, section: "national-teams" },
  { name: "UEFA European Championship", priority: 90, section: "national-teams" },
  { name: "UEFA Nations League", priority: 80, section: "national-teams" },
  { name: "FIFA Club World Cup", priority: 80, section: "world" },
  { name: "Ballon d'Or", priority: 80, section: "awards" },
  { name: "UEFA Super Cup", priority: 70, section: "europe" },
];

// Values that returned a hard error from APITube (bad/unsupported entity)
// get pushed here at runtime and skipped on subsequent picks for the rest
// of this invocation. Doesn't persist across invocations (Workers are
// stateless) - a value that's permanently broken will just get retried
// occasionally rather than being remembered forever, which is an
// acceptable tradeoff over adding a D1 table just for this.
const runtimeQuarantine = new Set<string>();
export function quarantineValue(name: string) {
  runtimeQuarantine.add(name);
}

// Groups entities by priority tier, then packs each tier's names into
// comma-separated chunks that stay at or below 120 characters (APITube
// filter value length guidance from the provided config).
function buildChunks(entities: Entity[]): Record<100 | 90 | 80 | 70, string[]> {
  const byTier: Record<100 | 90 | 80 | 70, Entity[]> = { 100: [], 90: [], 80: [], 70: [] };
  for (const e of entities) byTier[e.priority].push(e);

  const chunkTier = (list: Entity[]): string[] => {
    const chunks: string[] = [];
    let current: string[] = [];
    let currentLen = 0;
    for (const e of list) {
      if (runtimeQuarantine.has(e.name)) continue;
      const addLen = current.length ? e.name.length + 1 : e.name.length;
      if (currentLen + addLen > 120 && current.length) {
        chunks.push(current.join(","));
        current = [];
        currentLen = 0;
      }
      current.push(e.name);
      currentLen += addLen;
    }
    if (current.length) chunks.push(current.join(","));
    return chunks;
  };

  return { 100: chunkTier(byTier[100]), 90: chunkTier(byTier[90]), 80: chunkTier(byTier[80]), 70: chunkTier(byTier[70]) };
}

const ORG_CHUNKS = buildChunks(ORGANIZATIONS);
const PERSON_CHUNKS = buildChunks(PERSONS);
const EVENT_CHUNKS = buildChunks(EVENTS);

const TIER_CADENCE: Record<100 | 90 | 80 | 70, number> = { 100: 1, 90: 2, 80: 4, 70: 8 };

// Picks one (filter class, value chunk) pair for the given cycle number.
// Priority 100 chunks are eligible every cycle, 90 every 2nd, 80 every
// 4th, 70 every 8th - cycles where a lower tier is "due" get first crack,
// otherwise falls back to tier 100 so every cycle still queries something.
export function pickEntityQuery(cycle: number): { filterType: EntityClass; value: string } | null {
  const classes: [EntityClass, Record<100 | 90 | 80 | 70, string[]>][] = [
    ["organization.name", ORG_CHUNKS],
    ["person.name", PERSON_CHUNKS],
    ["event.name", EVENT_CHUNKS],
  ];

  const dueTiers = ([100, 90, 80, 70] as const).filter((t) => cycle % TIER_CADENCE[t] === 0);
  // Prefer the most specific (highest-cadence, i.e. least frequent) due
  // tier this cycle so 70/80-priority entities actually get a turn
  // instead of tier 100 crowding out everything else every single time.
  const orderedDue = [...dueTiers].sort((a, b) => TIER_CADENCE[b] - TIER_CADENCE[a]);

  for (const tier of orderedDue) {
    // Rotate through classes and their chunks for this tier using the
    // cycle number so repeated cycles at the same tier don't always pick
    // the same chunk.
    const options: { filterType: EntityClass; value: string }[] = [];
    for (const [filterType, chunks] of classes) {
      for (const value of chunks[tier]) options.push({ filterType, value });
    }
    if (options.length) return options[cycle % options.length];
  }
  return null;
}
