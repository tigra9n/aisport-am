export type GeneratedArticle = { title: string; excerpt: string; content: string; category: string };
export let lastGenerationDebug = "";

async function callClaude(systemPrompt: string, userPrompt: string, apiKey: string): Promise<{ text: string | null; debug: string }> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 55_000);
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
        // 900 wasn't enough: Sonnet 5's new tokenizer produces ~30% more
        // tokens for the same text, so a 200-300 word Armenian article as
        // JSON was getting cut off mid-response and failing to parse.
        max_tokens: 2048,
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
    return { text: textBlock.text, debug: `[${ms}ms] ok` };
  } catch (err) {
    return { text: null, debug: `[${Date.now() - started}ms] threw: ${String(err)}` };
  }
}

function parseArticleJson(raw: string, fallbackCategory: string): GeneratedArticle | null {
  try {
    const cleaned = raw.replace(/```json\s*|```\s*$/g, "").trim();
    const parsed = JSON.parse(cleaned) as Partial<GeneratedArticle>;
    if (!parsed.title || !parsed.excerpt || !parsed.content) return null;
    return {
      title: parsed.title.trim(),
      excerpt: parsed.excerpt.trim(),
      content: parsed.content.trim(),
      category: parsed.category?.trim() || fallbackCategory,
    };
  } catch {
    return null;
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
  if (!parsed) lastGenerationDebug = `parse failed, raw text: ${text.slice(0, 300)}`;
  return parsed;
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
  if (!parsed) lastGenerationDebug = `parse failed, raw text: ${text.slice(0, 300)}`;
  return parsed;
}

export async function generateFromSourceSnippet(
  apiKey: string,
  source: { title: string; snippet: string; sourceName: string },
): Promise<GeneratedArticle | null> {
  const userPrompt = `Ստորև տրված է սպորտային նորության վերնագիր և կարճ նկարագրություն (ոչ ամբողջ նյութ)՝ ${source.sourceName}-ից.
Վերնագիր՝ ${source.title}
Նկարագրություն՝ ${source.snippet}

Այս փաստերի հիման վրա գրիր ԱՄԲՈՂՋՈՎԻՆ ինքնուրույն, հայերեն նյութ (120-200 բառ)՝ քո սեփական բառերով, ո՛չ թարգմանություն, ո՛չ մոտ-պարաֆրազ։ Մի մեջբերիր ուղիղ արտահայտություններ բնագրից։ Եթե նկարագրությունը բավարար փաստ չի տալիս ամբողջական հոդված գրելու համար, գրիր ավելի կարճ, բայց ճշգրիտ ամփոփում։ category դաշտում գրիր ամենահարմար մարզաձևի անունը (Ֆուտբոլ, Բասկետբոլ, Թենիս, և այլն)։`;
  const { text, debug } = await callClaude(SYSTEM_PROMPT, userPrompt, apiKey);
  lastGenerationDebug = debug;
  if (!text) return null;
  const parsed = parseArticleJson(text, "Ֆուտբոլ");
  if (!parsed) lastGenerationDebug = `parse failed, raw text: ${text.slice(0, 300)}`;
  return parsed;
}
