// The ranking decides what the site writes about. There is no way to see
// it working from outside - a published article looks the same whether it
// was chosen or stumbled upon - so the judgement is tested directly, on
// real headlines taken from the feeds on the evening it went in.
import { test } from "node:test";
import assert from "node:assert/strict";
import { rankGathered, beatOf } from "../lib/story-ranking.ts";

const BEAT = {
  "Football Espana": "Spain",
  "Marca": "Spain",
  "Mundo Deportivo": "Spain",
  "Sport.es": "Spain",
  "Barca Universal": "Spain",
  "Madrid Universal": "Spain",
  "Football Italia": "Italy",
  "Gazzetta dello Sport": "Italy",
  "RMC Sport Football": "France",
  "Record": "Portugal",
};

const story = (sourceName, title, extra = {}) => ({
  sourceName,
  beat: BEAT[sourceName] ?? "England",
  item: { title, link: `https://example.test/${encodeURIComponent(title)}`, snippet: "", imageUrl: null, pubDate: null, ...extra },
});

// Every one of these ran in a real feed on 5 September. Six desks led with
// Manchester City beating Coventry; one wrote about a Cardiff player and a
// supporter; one about a Barcelona captaincy vote.
const EVENING = [
  story("BBC Sport Football", "Haaland header maintains perfect winning start for Man City"),
  story("Sky Sports Premier League", "Haaland hits new record and Fernandez shines as Man City beat Coventry"),
  story("Metro Football", "Erling Haaland makes Arsenal Premier League claim after Man City beat Coventry"),
  story("Manchester Evening News Football", "Man City vs Coventry City highlights and reaction as Enzo Maresca maintains start"),
  story("101 Great Goals", "Maresca claims City spending necessary to match Arsenal"),
  story("Mirror Football", "Enzo Fernandez quickly wins over Man City fans but Coventry incident sours night"),
  story("Independent Football", "How cheaper buys outshone £125m Enzo Fernandez on Manchester City bow"),

  story("Mirror Football", "Krystian Bielik appears to grab young Portsmouth fan by the throat during Cardiff win"),
  story("Metro Football", "Krystian Bielik grabs Portsmouth fan by the throat in Cardiff City defeat"),
  story("GiveMeSport Football", "Cardiff City Boss Speaks Out on Viral Footage of Krystian Bielik Choking Fan"),

  story("Football Espana", "Players' Vote and Flick Back Lamine Yamal for Barcelona Captaincy"),

  story("Football League World", "Wolves once had a youngster tipped to be worth £100m - look where he is now"),
  story("Sports Mole Football", "Getafe vs Celta Vigo - prediction, team news, lineups"),
  story("Sports Mole Football", "Elche vs Real Sociedad - prediction, team news, lineups"),
];

test("the story the most desks are carrying comes first", () => {
  const ranked = rankGathered(EVENING);
  assert.match(ranked[0].item.title, /Man City|Manchester City|Maresca|Fernandez/);
  // Six other desks carried the City win; nothing else that evening comes
  // close, so the gap - not just the order - is what matters.
  assert.ok(ranked[0].corroboration >= 3, `expected the lead story to be corroborated, got ${ranked[0].corroboration}`);
});

test("a story only one desk carried ranks below one that several did", () => {
  const ranked = rankGathered(EVENING);
  const yamal = ranked.findIndex((r) => r.item.title.includes("Yamal"));
  const bielik = ranked.findIndex((r) => r.item.title.includes("Bielik"));
  assert.ok(bielik < yamal, "three desks carried Bielik and one carried Yamal, so Bielik should rank higher");
});

test("two desks are not counted as one", () => {
  const ranked = rankGathered(EVENING);
  const bielik = ranked.find((r) => r.item.title.includes("Bielik"));
  assert.ok(bielik.corroboration >= 2, `expected at least two other desks, got ${bielik.corroboration}`);
  assert.ok(!bielik.alsoIn.includes(bielik.sourceName), "a desk must not corroborate itself");
});

test("one desk publishing the same story twice does not make it the lead", () => {
  const padded = [
    ...EVENING.filter((s) => !s.item.title.includes("Man City") && !s.item.title.includes("Manchester City") && !s.item.title.includes("Maresca") && !s.item.title.includes("Fernandez")),
    story("Daily Star Football", "Kilmarnock striker Kowalczyk seals move to Hibernian"),
    story("Daily Star Football", "Kowalczyk to Hibernian: Kilmarnock striker seals move"),
    story("Daily Star Football", "Hibernian sign Kilmarnock striker Kowalczyk"),
  ];
  const ranked = rankGathered(padded);
  assert.ok(!ranked[0].item.title.includes("Kowalczyk"), "three headlines from one desk are one desk's choice, not the story of the hour");
});

test("rolling live pages are never offered, in any language", () => {
  const ranked = rankGathered([
    story("Sky Sports Transfers", "Transfer Centre LIVE! Richarlison latest and free agents still available"),
    story("Football Italia", "Serie A Liveblog: Fiorentina vs. Torino, Inter vs. Napoli"),
    story("RMC Sport Football", "DIRECT. Nice-Le Mans: Wahi deja decisif pour son retour"),
    story("Record", "Roma-Atalanta, em direto"),
    story("BBC Sport Football", "Chilwell scores on Palace return in victory at Fulham"),
  ]);
  assert.equal(ranked.length, 1);
  assert.match(ranked[0].item.title, /Chilwell/);
});

test("among equally corroborated stories the one with a picture wins", () => {
  const ranked = rankGathered([
    story("BBC Sport Football", "Chilwell scores on Palace return in victory at Fulham"),
    story("Metro Football", "Ben Chilwell scores on Palace return at Fulham", { imageUrl: "https://example.test/pic.jpg" }),
  ]);
  assert.equal(ranked[0].sourceName, "Metro Football");
});

test("a country is read off the feed address, not guessed from the name", () => {
  assert.equal(beatOf("https://e00-marca.uecdn.es/rss/futbol/primera-division.xml"), "Spain");
  assert.equal(beatOf("https://www.gazzetta.it/dynamic-feed/rss/section/Calcio.xml"), "Italy");
  assert.equal(beatOf("https://dwh.lequipe.fr/api/edito/rss?path=/Football"), "France");
  assert.equal(beatOf("https://newsfeed.kicker.de/news/fussball"), "Germany");
  assert.equal(beatOf("https://feeds.bbci.co.uk/sport/football/rss.xml"), "England");
});

// The reason the share exists. Twenty-five English desks against six
// Spanish ones means a raw count hands every hour to the Premier League by
// arithmetic. Here four of the six Spanish papers are leading with the same
// Barcelona story while five of the twenty-five English desks carry a
// mid-table one - the Spanish story is the bigger story and must win.
test("a story most of a smaller press is leading with beats a wider but thinner English one", () => {
  const spanish = ["Marca", "Mundo Deportivo", "Sport.es", "Barca Universal"].map((desk) =>
    story(desk, `Lamine Yamal renueva con el Barcelona hasta 2032 clausula`),
  );
  const englishPadding = ["Football Espana", "Madrid Universal"].map((desk) =>
    story(desk, "Sevilla appoint new goalkeeping coach"),
  );
  const english = ["BBC Sport Football", "Sky Sports Premier League", "Metro Football", "Mirror Football", "The Sun Football"].map((desk) =>
    story(desk, "Brentford midfielder Jensen signs new contract at the club"),
  );
  const filler = Array.from({ length: 20 }, (_, i) =>
    story(["Telegraph Football", "Standard Football", "Daily Star Football", "GiveMeSport Football"][i % 4], `Unrelated report number ${i} about a youth academy`),
  );
  const ranked = rankGathered([...spanish, ...englishPadding, ...english, ...filler]);
  assert.equal(ranked[0].beat, "Spain", `expected the Spanish story first, got ${ranked[0].beat}: ${ranked[0].item.title}`);
  assert.match(ranked[0].item.title, /Yamal/);
});
