// Football named-entity list for APITube's rss source, per user-provided
// config (apitube-football-entities-v1.json).
//
// Live testing found that organization.name (clubs) and event.name
// (competitions) both return "entity not found" (ER0220/ER0228) for
// essentially every name tried, including extremely famous ones
// ("Manchester United", "UEFA Champions League") - APITube's entity
// taxonomy doesn't appear to cover football clubs/competitions this way.
// person.name DOES work (confirmed: "Lionel Messi", "Henrikh Mkhitaryan"
// both return real results), but coverage is inconsistent even among
// star players ("Kylian Mbappe" wasn't found), and a comma-separated
// list fails entirely if even one name in it isn't recognized. So:
// person.name only, queried one name at a time (no chunking), with a
// per-cycle fallback chain trying the next name if one comes back empty
// or "not found".

export type EntityClass = "person.name";

type Entity = { name: string; priority: 100 | 90 | 80 | 70; section: string };

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

// Names that returned ER0216 "entity person name not found" get pushed
// here at runtime and skipped for the rest of this invocation. Doesn't
// persist across invocations (Workers are stateless) - acceptable
// tradeoff over adding a D1 table just for this; a permanently-invalid
// name just gets retried occasionally instead of remembered forever.
const runtimeQuarantine = new Set<string>();
export function quarantineValue(name: string) {
  runtimeQuarantine.add(name);
}

const TIER_CADENCE: Record<100 | 90 | 80 | 70, number> = { 100: 1, 90: 2, 80: 4, 70: 8 };

// Returns an ordered list of individual person names to try this cycle,
// most-specific-due-tier first, falling back through the other tiers
// (tier 100 - Armenia - last, since APITube coverage of Armenian players
// is spottier than world-famous names). The caller tries them one at a
// time and stops at the first one that actually returns articles, since
// even well-known names sometimes come back "not found" and a
// comma-separated list fails entirely if any one name in it is bad.
export function pickPersonQueryChain(cycle: number): string[] {
  const byTier: Record<100 | 90 | 80 | 70, string[]> = { 100: [], 90: [], 80: [], 70: [] };
  for (const e of PERSONS) {
    if (runtimeQuarantine.has(e.name)) continue;
    byTier[e.priority].push(e.name);
  }

  const dueTiers = ([100, 90, 80, 70] as const).filter((t) => cycle % TIER_CADENCE[t] === 0);
  const orderedDue = [...dueTiers].sort((a, b) => TIER_CADENCE[b] - TIER_CADENCE[a]);
  const fallbackTiers = ([100, 90, 80, 70] as const).filter((t) => !dueTiers.includes(t)).sort((a, b) => TIER_CADENCE[b] - TIER_CADENCE[a]);
  const tierOrder = [...orderedDue, ...fallbackTiers];

  const chain: string[] = [];
  for (const tier of tierOrder) {
    const names = byTier[tier];
    if (!names.length) continue;
    // Rotate the starting point within this tier by cycle so repeated
    // cycles at the same tier don't always try the same name first.
    const start = cycle % names.length;
    for (let i = 0; i < names.length; i++) chain.push(names[(start + i) % names.length]);
  }
  return chain;
}
