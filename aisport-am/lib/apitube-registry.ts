// Which names APITube's person registry does not carry.
//
// fetchApiTubePerson asks the strict person.name endpoint first, because
// when it matches it is a broader search than looking for the name in a
// headline. But the registry does not carry most footballers: measured
// directly, fifteen of twenty names came back ER0216 - and not the obscure
// ones. Mbappe, Yamal, Haaland, Vinicius, Bellingham, Saka, Isak, Wirtz,
// Musiala and Osimhen are all absent, while Messi, Salah, Kane and
// Mkhitaryan are present. The account's dashboard reported a 64% error
// rate for the week, which is this and almost nothing else.
//
// The code already had a memory for such names, but it was a Set in the
// worker's memory, and a worker is recycled constantly - so in practice
// every name was retried on every attempt, forever. This one is in D1, so
// it survives, and a name is re-tried after a month in case the registry
// has since added it.
const RECHECK_AFTER_MS = 30 * 24 * 60 * 60 * 1000;
const MEMO_TTL_MS = 10 * 60 * 1000;

let memo: { names: Set<string>; loadedAt: number } | null = null;
let tableReady: Promise<unknown> | null = null;

async function database(): Promise<D1Database | undefined> {
  try {
    const { env } = await import("cloudflare:workers");
    return (env as unknown as { DB?: D1Database }).DB;
  } catch {
    return undefined;
  }
}

async function ensureTable(db: D1Database) {
  tableReady ??= db
    .prepare("CREATE TABLE IF NOT EXISTS apitube_unknown_person (name TEXT PRIMARY KEY, noted_at INTEGER NOT NULL)")
    .run();
  await tableReady;
}

export async function unknownPersonNames(): Promise<Set<string>> {
  if (memo && Date.now() - memo.loadedAt < MEMO_TTL_MS) return memo.names;
  const db = await database();
  if (!db) return new Set();
  try {
    await ensureTable(db);
    const rows = await db
      .prepare("SELECT name FROM apitube_unknown_person WHERE noted_at > ?")
      .bind(Date.now() - RECHECK_AFTER_MS)
      .all<{ name: string }>();
    const results = (rows.results ?? []) as { name: string }[];
    const names = new Set<string>(results.map((row) => row.name));
    memo = { names, loadedAt: Date.now() };
    return names;
  } catch {
    // Never let this stop a search: not knowing simply costs the failed
    // request it was meant to save.
    return memo?.names ?? new Set();
  }
}

export async function rememberUnknownPerson(name: string): Promise<void> {
  const db = await database();
  if (!db) return;
  try {
    await ensureTable(db);
    await db
      .prepare("INSERT INTO apitube_unknown_person(name,noted_at) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET noted_at=excluded.noted_at")
      .bind(name, Date.now())
      .run();
    memo?.names.add(name);
  } catch { /* the next attempt will try again */ }
}
