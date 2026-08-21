import { demoStandings, type StandingRow } from "./football";

export async function getStandings(code: string): Promise<{ rows: StandingRow[]; demo: boolean }> {
  const { env } = await import("cloudflare:workers");
  const token = (env as unknown as Record<string, string | undefined>).FOOTBALL_DATA_TOKEN;
  if (!token) return { rows: demoStandings(code), demo: true };

  try {
    const response = await fetch(`https://api.football-data.org/v4/competitions/${code}/standings`, {
      headers: { "X-Auth-Token": token },
      next: { revalidate: 300 },
    });
    if (!response.ok) return { rows: demoStandings(code), demo: true };
    const data = await response.json() as { standings?: Array<{ type: string; table: Array<{ position: number; team: { name: string }; playedGames: number; won: number; draw: number; lost: number; goalDifference: number; points: number }> }> };
    const table = data.standings?.find((standing) => standing.type === "TOTAL")?.table;
    if (!table) return { rows: demoStandings(code), demo: true };
    return { demo: false, rows: table.map((row) => ({ position: row.position, team: row.team.name, played: row.playedGames, won: row.won, draw: row.draw, lost: row.lost, goalDifference: row.goalDifference, points: row.points })) };
  } catch {
    return { rows: demoStandings(code), demo: true };
  }
}
