export type GeneratedArticle = { title: string; excerpt: string; content: string; category: string };
export let lastGenerationDebug = "";

async function callClaude(systemPrompt: string, userPrompt: string, apiKey: string): Promise<{ text: string | null; debug: string }> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 100_000);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        // Bumped 900 -> 2048 -> 4096 -> 8192: even 4096 still produced an
        // occasional truncated/unparseable JSON response (Claude's own
        // stop_reason=max_tokens before finishing the JSON structure).
        // Generous headroom here since there's no real cost/latency
        // concern for this use case.
        max_tokens: 8192,
        // Adaptive thinking is on by default on Sonnet 5 (effort: high),
        // which added enough latency to blow past our request timeout for
        // every single call. This is a straightforward rewrite/formatting
        // task, not something needing multi-step reasoning, so disable
        // thinking entirely for speed.
        thinking: { type: "disabled" },
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    clearTimeout(timeoutId);
    const ms = Date.now() - started;
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      return { text: null, debug: `[${ms}ms] http ${response.status}: ${bodyText.slice(0, 300)}` };
    }
    const data = await response.json() as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const textBlock = data.content?.find((block) => block.type === "text");
    if (!textBlock?.text) return { text: null, debug: `[${ms}ms] no text block, stop_reason=${data.stop_reason}, raw=${JSON.stringify(data).slice(0, 300)}` };
    return { text: textBlock.text, debug: `[${ms}ms] ok, stop_reason=${data.stop_reason}, len=${textBlock.text.length}` };
  } catch (err) {
    return { text: null, debug: `[${Date.now() - started}ms] threw: ${String(err)}` };
  }
}

// Sports keyword detection for fallback categorization, used when the
// model's JSON response omits category (or for RSS content pulled from
// non-football sources, where hardcoding "Ֆուտբոլ" as fallback was
// mislabeling basketball/tennis/etc. articles as football).
const CATEGORY_KEYWORDS: [string, string[]][] = [
  ["Բասկետբոլ", ["basketball", "nba", "wnba", "hoops", "point guard", "rebound", "dunk"]],
  ["Թենիս", ["tennis", "wimbledon", "us open", "roland garros", "atp", "wta", "grand slam"]],
  ["Կրիկետ", ["cricket", "test match", "odi", "t20", "wicket", "batsman", "bowler"]],
  ["Բռնցքամարտ / ՄՄԱ", ["boxing", "ufc", "mma", "heavyweight", "knockout"]],
  ["Ամերիկյան ֆուտբոլ", ["nfl", "super bowl", "quarterback", "touchdown"]],
  ["Հոկեյ", ["nhl", "hockey", "ice hockey"]],
  ["Ֆորմուլա 1", ["formula 1", "f1 ", "grand prix", "pole position"]],
  ["Գոլֆ", ["golf", "pga tour", "masters tournament"]],
];

function guessCategory(text: string, fallback: string): string {
  const lower = text.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return category;
  }
  return fallback;
}

function parseArticleJson(raw: string, fallbackCategory: string): { article: GeneratedArticle | null; reason: string } {
  try {
    let cleaned = raw.replace(/```json\s*|```\s*$/g, "").trim();
    // Claude occasionally emits a raw (unescaped) newline/tab/control
    // character inside a string value - e.g. a literal line break in the
    // middle of the content field - which is invalid per the JSON spec
    // and makes JSON.parse throw "Bad control character in string
    // literal" even though the JSON is otherwise complete and well-formed.
    // Our expected output is compact single-line JSON, so any raw control
    // character here is virtually certain to be inside a string value
    // that needs escaping, not intentional structural whitespace.
    cleaned = cleaned.replace(/[\u0000-\u001F]/g, (ch) => {
      if (ch === "\n") return "\\n";
      if (ch === "\r") return "\\r";
      if (ch === "\t") return "\\t";
      return "";
    });
    const parsed = JSON.parse(cleaned) as Partial<GeneratedArticle>;
    if (!parsed.title || !parsed.excerpt || !parsed.content) {
      return { article: null, reason: `missing fields: title=${!!parsed.title}, excerpt=${!!parsed.excerpt}, content=${!!parsed.content}` };
    }
    return {
      article: {
        title: parsed.title.trim(),
        excerpt: parsed.excerpt.trim(),
        content: parsed.content.trim(),
        category: parsed.category?.trim() || fallbackCategory,
      },
      reason: "ok",
    };
  } catch (err) {
    return { article: null, reason: `JSON.parse threw: ${String(err)}` };
  }
}

const SYSTEM_PROMPT = `Դու AISport.am-ի փորձառու սպորտային խմբագիրն ես, հայերենով ես գրում արդեն տարիներ շարունակ։ Ոճդ բնական է, ուղիղ, առանց թարգմանական/արհեստական հնչողության (ոչ մի «Հարցերը ցույց կտան», «կվայելեն իրար» տիպի անճշտություն)։ Օգտագործիր իրական սպորտային լրագրության բառապաշար (հանդիպում, մրցակցություն, հաղթանակ, պարտություն, միավորներ), ոչ բառացի թարգմանություններ։ Խուսափիր կրկնություններից և ընդհանրաբանություններից, եղիր կոնկրետ։ Պատասխանիր ՄԻԱՅՆ JSON օբյեկտով, առանց markdown-ի կամ լրացուցիչ տեքստի, հետևյալ կառուցվածքով.
{"title":"Կարճ, կոնկրետ վերնագիր","excerpt":"1-2 նախադասությամբ ամփոփում","content":"3-5 պարբերությամբ ամբողջական նյութ","category":"Ֆուտբոլ"}`;

export async function generateMatchRecap(
  apiKey: string,
  match: { home: string; away: string; homeScore: number | null; awayScore: number | null; competition: string; venue: string },
  events: { minute: string; team: string; player: string; label: string }[],
  statistics?: { team: string; possession: string; shotsOnGoal: string; totalShots: string; xg: string }[],
): Promise<GeneratedArticle | null> {
  const eventsText = events.length
    ? events.map((e) => `${e.minute} ${e.team}՝ ${e.label}${e.player !== "—" ? ` (${e.player})` : ""}`).join("\n")
    : "Իրադարձությունների մանրամասն տվյալ չկա։";
  const statsText = statistics && statistics.length === 2
    ? statistics.map((s) => `${s.team}՝ տիրապետում ${s.possession}, հարվածներ դարպասին ${s.shotsOnGoal} (ընդամենը ${s.totalShots})`).join("\n")
    : null;
  const userPrompt = `Գրիր տեղեկատվական (200-300 բառ) recap հոդված այս խաղի արդյունքից.
Մրցաշար՝ ${match.competition}
${match.home} ${match.homeScore} : ${match.awayScore} ${match.away}
Մարզադաշտ՝ ${match.venue}
Իրադարձություններ.
${eventsText}
${statsText ? `\nՎիճակագրություն.\n${statsText}` : ""}

Հենվիր միայն այս փաստերի վրա, ոչինչ մի հորինիր (խաղացողների անուններ, գումարներ և այլն, որ չկան տվյալների մեջ)։ Եթե վիճակագրություն կա, հիշատակիր կոնկրետ թվերով (տիրապետում, հարվածներ)։ category դաշտում գրիր "Ֆուտբոլ"։`;
  const { text, debug } = await callClaude(SYSTEM_PROMPT, userPrompt, apiKey);
  lastGenerationDebug = debug;
  if (!text) return null;
  const parsed = parseArticleJson(text, "Ֆուտբոլ");
  if (!parsed.article) lastGenerationDebug = `parse failed (${parsed.reason}), len=${text.length}, tail=${text.slice(-150)}`;
  return parsed.article;
}

export async function generateMatchPreview(
  apiKey: string,
  match: { home: string; away: string; competition: string; kickoff: string },
  context: { h2h?: string; homeForm?: string; awayForm?: string; standings?: string; prediction?: string },
): Promise<GeneratedArticle | null> {
  const contextLines = [
    context.h2h ? `Նախկին հանդիպումներ՝ ${context.h2h}` : null,
    context.homeForm ? `${match.home}-ի վերջին ձևը՝ ${context.homeForm}` : null,
    context.awayForm ? `${match.away}-ի վերջին ձևը՝ ${context.awayForm}` : null,
    context.standings ? `Աղյուսակում դիրքերը՝ ${context.standings}` : null,
    context.prediction ? context.prediction : null,
  ].filter(Boolean).join("\n");
  const userPrompt = `Գրիր տեղեկատվական preview հոդված (180-280 բառ) այս առաջիկա խաղից՝ օգտագործելով ստորև տրված ԲՈԼՈՐ կոնկրետ տվյալները (թվեր, դիրքեր, հավանականություններ), ոչ միայն ընդհանուր նախադասություններ.
Մրցաշար՝ ${match.competition}
${match.home} - ${match.away}
Ժամանակ՝ ${match.kickoff}
${contextLines || "Լրացուցիչ վիճակագրություն չկա։"}

Հենվիր միայն այս փաստերի վրա, ոչինչ մի հորինիր։ Եթե տվյալ կա (ձև, աղյուսակի դիրք, նախկին հանդիպումներ, հավանականություններ), պարտադիր հիշատակիր կոնկրետ թվերով, ոչ ընդհանրաբանված։ category դաշտում գրիր "Ֆուտբոլ"։`;
  const { text, debug } = await callClaude(SYSTEM_PROMPT, userPrompt, apiKey);
  lastGenerationDebug = debug;
  if (!text) return null;
  const parsed = parseArticleJson(text, "Ֆուտբոլ");
  if (!parsed.article) lastGenerationDebug = `parse failed (${parsed.reason}), len=${text.length}, tail=${text.slice(-150)}`;
  return parsed.article;
}

export async function generateFromSourceSnippet(
  apiKey: string,
  source: { title: string; snippet: string; sourceName: string; fullText?: string | null },
): Promise<GeneratedArticle | null> {
  const factBase = source.fullText && source.fullText.length > source.snippet.length
    ? source.fullText.slice(0, 6000)
    : source.snippet;
  const userPrompt = `Ստորև տրված է սպորտային նորության վերնագիր և բնագրի տեքստ (անգլերեն, ${source.sourceName}-ից).
Վերնագիր՝ ${source.title}
Բնագիր՝ ${factBase}

Այս փաստերի հիման վրա գրիր ծանրակշիռ, բովանդակային հայերեն նյութ (250-400 բառ)՝ քո սեփական բառերով վերաշարադրված (ո՛չ ուղիղ թարգմանություն, ո՛չ մոտ-պարաֆրազ, մի մեջբերիր ամբողջական նախադասություններ բնագրից)։

ԿԱՐԵՎՈՐ.
- Պահպանիր բնագրում հիշատակված ԲՈԼՈՐ իրական անունները՝ խաղացողներ, թիմեր, մարզիչներ, ակումբներ, մրցաշարեր, հաշիվներ/թվեր, ամսաթվեր. սրանք փաստեր են, ուստի պետք է հստակ երևան հոդվածում։
- Մի՛ սահմանափակվիր պարզ վերարտադրությամբ. ավելացրու ԲՈՎԱՆԴԱԿԱՅԻՆ խորություն, եթե բնագրից բխում է. ինչու է այս իրադարձությունը կարևոր (կոնտեքստ), ինչպես է կապված ընթացիկ սեզոնի/մրցաշարի իրավիճակի հետ (նախապատմություն), ինչ թվեր/վիճակագրություն կան բնագրում (հաշիվներ, դիրքեր, փոխանցումների գումարներ, ռեկորդներ)։ Մի հորինիր փաստեր, որ բնագրում չկան, բայց օգտագործիր ամեն մի իրական մանրամասն, որ առկա է։
- Կառուցվածք. սկսիր հիմնական լուրով, հետո ավելացրու նախապատմություն/կոնտեքստ, վերջացրու հետևանքով կամ առաջիկայով (եթե բնագրում կա)։ 2-4 պարբերություն։
- Մի գրիր ընդհանրաբանված նախադասություններ ("մի թիմ հաղթեց", "խաղացողը լավ արտահայտվեց") եթե բնագրում կոնկրետ անուն/թիվ կա։

Եթե բնագիրը սակավ է ու իրական խորություն հնարավոր չէ ավելացնել, գրիր ավելի կարճ, բայց ճշգրիտ ամփոփում՝ դարձյալ պահպանելով առկա անունները. մի ձգձգիր առանց իրական բովանդակության։ category դաշտում գրիր ամենահարմար մարզաձևի անունը (Ֆուտբոլ, Բասկետբոլ, Թենիս, և այլն)։`;
  const { text, debug } = await callClaude(SYSTEM_PROMPT, userPrompt, apiKey);
  lastGenerationDebug = debug;
  if (!text) return null;
  const smartFallback = guessCategory(`${source.title} ${source.snippet}`, "Ֆուտբոլ");
  const parsed = parseArticleJson(text, smartFallback);
  if (!parsed.article) lastGenerationDebug = `parse failed (${parsed.reason}), len=${text.length}, tail=${text.slice(-150)}`;
  return parsed.article;
}
