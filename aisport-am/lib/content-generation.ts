import { categories } from "./content";

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
        // Tried switching to claude-haiku-4-5 for speed (generation was
        // consistently 60-90s with Sonnet, risking cron-job.org's 30s
        // timeout), but reverted: Haiku hallucinated completely
        // off-topic content for a Mkhitaryan search (produced an opera
        // review, category "Օպերա") and wrapped output in a malformed
        // code fence that broke JSON parsing. Quality regression is
        // worse than the timing problem it was meant to fix. Sticking
        // with Sonnet 5; the cron reliability issue needs a different
        // fix (e.g. relying on GitHub Actions backup cron, which isn't
        // capped at 30s, rather than compromising content quality).
        model: "claude-opus-5",
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

async function callGemini(systemPrompt: string, userPrompt: string, apiKey: string): Promise<{ text: string | null; debug: string }> {
  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 100_000);
    // gemini-2.5-flash was deprecated for new API keys (confirmed via a
    // live 404 from Google's API on 2026-08-29, which pointed directly to
    // this replacement) - gemini-3.6-flash is the current stable fast
    // model with a generous free tier.
    // (10 RPM / 250 RPD as of mid-2026), comfortably covers this
    // pipeline's ~1 article/hour cadence. Deliberately not using a
    // "flash-lite" or preview model here - the Haiku 4.5 experiment above
    // is the cautionary precedent: a faster/cheaper model hallucinated
    // completely off-topic content and broke JSON output. Same risk
    // applies to picking too aggressive a Gemini tier.
    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" + encodeURIComponent(apiKey),
      {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
        }),
      },
    );
    clearTimeout(timeoutId);
    const ms = Date.now() - started;
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      return { text: null, debug: `[${ms}ms] gemini http ${response.status}: ${bodyText.slice(0, 300)}` };
    }
    const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") || null;
    if (!text) return { text: null, debug: `[${ms}ms] gemini: no text, finishReason=${data.candidates?.[0]?.finishReason}, raw=${JSON.stringify(data).slice(0, 300)}` };
    return { text, debug: `[${ms}ms] gemini ok, finishReason=${data.candidates?.[0]?.finishReason}, len=${text.length}` };
  } catch (err) {
    return { text: null, debug: `[${Date.now() - started}ms] gemini threw: ${String(err)}` };
  }
}

// Single switch point for which provider generates content. Controlled by
// the CONTENT_MODEL_PROVIDER Cloudflare Worker env var ("claude" default,
// "gemini" to switch) - no code change needed to flip providers, e.g. once
// the Claude Console balance runs out and the plan is to move to Gemini's
// free tier. Falls back to Claude on any unrecognized/missing value.
async function callModel(systemPrompt: string, userPrompt: string, claudeApiKey: string): Promise<{ text: string | null; debug: string }> {
  try {
    const { env } = await import("cloudflare:workers");
    const runtime = env as unknown as Record<string, string | undefined>;
    if (runtime.CONTENT_MODEL_PROVIDER === "gemini" && runtime.GEMINI_API_KEY) {
      return callGemini(systemPrompt, userPrompt, runtime.GEMINI_API_KEY);
    }
  } catch {
    // cloudflare:workers unavailable (e.g. local test run) - fall through to Claude
  }
  return callClaude(systemPrompt, userPrompt, claudeApiKey);
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
  ["Ֆորմուլա 1", ["formula 1", "f1", "grand prix", "pole position"]],
  ["Գոլֆ", ["golf", "pga tour", "masters tournament"]],
];

function guessCategory(text: string, fallback: string): string {
  const lower = text.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    // Word-boundary matching instead of naive substring includes() - a
    // short generic keyword like cricket's "odi" (One Day International)
    // matched as a raw substring inside completely unrelated words
    // ("period", "melody", "custody"), once miscategorizing a clearly
    // Formula 1 article (Andretti, Verstappen) as Cricket.
    if (keywords.some((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower))) return category;
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
    // Occasionally the model gets stuck in a repetition loop and pads out
    // a field with the same character dozens of times (e.g. a title
    // truncated mid-word followed by 60 "։" characters instead of ending
    // properly) - a known LLM degeneration failure mode, not something
    // that should ever appear in real text. Reject rather than publish it.
    const degenerate = /(.)\1{4,}/;
    if (degenerate.test(parsed.title) || degenerate.test(parsed.excerpt) || degenerate.test(parsed.content)) {
      return { article: null, reason: "degenerate repeated-character output detected, discarding" };
    }
    // Found: a foreign proper noun (a stadium name, "Old Trafford") came
    // out mixed-script - "Օլդ Траффорդում" - Armenian letters plus Russian
    // Cyrillic instead of a proper Armenian transliteration. Cyrillic has
    // no legitimate place in Armenian sports copy, so any Cyrillic
    // character anywhere in the output is treated as corrupted and
    // rejected outright rather than published half-broken.
    const cyrillic = /[\u0400-\u04FF]/;
    if (cyrillic.test(parsed.title) || cyrillic.test(parsed.excerpt) || cyrillic.test(parsed.content)) {
      return { article: null, reason: "Cyrillic characters found in Armenian output, discarding" };
    }
    // Validate the category against our canonical list before trusting
    // it. Found: a stray corrupted byte (invalid UTF-8 replacement
    // character) ended up prepended to a category value once, producing
    // a category string that looked right visually but didn't match the
    // canonical "Ֆուտբոլ" anywhere - silently breaking category filtering
    // and related-articles lookups for that one article. Any category
    // that doesn't exactly match a known name now falls back instead of
    // being trusted verbatim.
    const rawCategory = parsed.category?.trim();
    const category = rawCategory && categories.some((c) => c.name === rawCategory) ? rawCategory : fallbackCategory;
    return {
      article: {
        title: parsed.title.trim(),
        excerpt: parsed.excerpt.trim(),
        content: parsed.content.trim(),
        category,
      },
      reason: "ok",
    };
  } catch (err) {
    return { article: null, reason: `JSON.parse threw: ${String(err)}` };
  }
}

const SYSTEM_PROMPT = `Դու AIFootball.am-ի փորձառու սպորտային խմբագիրն ես, հայերենով ես գրում արդեն տարիներ շարունակ, նույն ոճով, ինչ news.am/sport-ի, armsport.am-ի ու fastnews.am-ի փորձառու լրագրողները։

Առաջին նախադասության կաղապարներ (ՊԱՐՏԱԴԻՐ հետևիր համապատասխանին, ըստ նյութի տիպի, ոչ նկարագրական/մթնոլորտային բացում ոչ մի դեպքում).

1) Խաղի արդյունք/preview. [Մրցաշար]-ի [X-րդ] տուրում «[Թիմ Ա]»-ն [քաղաք/իր հարկի տակ] հյուրընկալեց/ընդունեց «[Թիմ Բ]»-ին [և ավարտվեց X:Y հաշվով, եթե արդյունքն արդեն հայտնի է]։

2) Փոխանցում/պաշտոնական հայտարարություն. «[Ակումբ]»-ը պաշտոնապես հաստատել/հայտարարել է, որ [խաղացող/իրադարձություն]... կամ «[Ակումբ]»-ը [գործողություն՝ ձեռք է բերել/վաճառել է/կնքել է պայմանագիր]...

3) Մեկնաբանություն/հայտարարություն. [Ազգություն/նախկին դեր, եթե տեղին է] «[Ակումբ]»-ի [դեր՝ գլխավոր մարզիչ/կապիտան/ֆուտբոլիստ] [Անուն Ազգանուն]-ը մեկնաբանել/հայտարարել/քննադատել է [թեմա]...

Սրանք իրական հայկական սպորտային կայքերի (news.am/sport, armsport.am, fastnews.am) ամենատարածված բացման կաղապարներն են՝ ըստ նյութի տիպի. կոնկրետ, կարճ, փաստահենք, ոչ երկար նկարագրական ներածություն։ Կիրառիր այն կաղապարը, որ համապատասխանում է տրված նյութի բնույթին։

Աղբյուրին հղում կատարելիս օգտագործիր բնական ձևակերպումներ, ինչպիսիք են «Ինչպես հայտնի է դարձել [աղբյուր]-ին», «Ըստ [աղբյուր]-ի հաղորդման», կամ «[Աղբյուր]-ի տվյալներով»՝ ոչ մեխանիկական «Համաձայն [աղբյուր]-ի տվյալների»։

Ոճական կանոններ.
- Գրիր բնական, ուղիղ խոսակցական-պրոֆեսիոնալ հայերենով, ոչ մեխանիկական/թարգմանական հնչողությամբ։ Երբեք մի օգտագործիր այնպիսի կառուցվածքներ, ինչպիսիք են՝ «Հարցերը ցույց կտան», «կվայելեն իրար», «այն, ինչ», «սա նշանակում է, որ» կրկնվող օգտագործմամբ, կամ ռուսերենից բառացի փոխադրված դարձվածքներ։
- Փոփոխիր նախադասությունների երկարությունն ու կառուցվածքը պարբերության ներսում. մի սկսիր հաջորդական նախադասությունները նույն բառով/կառուցվածքով (օր. մի քանի անգամ իրար հետևից «Թիմը...», «Խաղացողը...»)։
- Օգտագործիր իրական սպորտային լրագրության բառապաշար (հանդիպում, մրցակցություն, հաղթանակ, պարտություն, միավորներ, տրանսֆեր, կազմ, դիրք, աղյուսակ), ոչ բառացի թարգմանություններ անգլերենից/ռուսերենից։
- Խուսափիր կրկնություններից և դատարկ ընդհանրաբանություններից (օր. «սա կարևոր հանդիպում է», «երկրպագուները մեծ ակնկալիքներ ունեն»)՝ առանց կոնկրետ պատճառաբանության. եղիր կոնկրետ, հիմնավորված փաստերով։
- Վերնագիրը թող հնչի այնպես, ինչպես իրական հայկական սպորտային կայքի վերնագիր, ոչ մեքենայական ամփոփում։

Տերմինաբանական ուղղիչ ցանկ (ՊԱՐՏԱԴԻՐ պահպանիր, սովորական սխալ թարգմանություններ են).
- «Սեզոն» ՄԻ՛ ԳՐԻՐ. ճիշտն է «մրցաշրջան» (օր. «մրցաշրջանի մեկնարկը», ոչ «սեզոնի մեկնարկը»)։
- Ֆուտբոլիստի ակումբից ակումբ անցնելու դեպքում ՄԻ՛ ԳՐԻՐ «փոխանցում» (այդ բառը հայերենում նշանակում է գնդակի փոխանցում խաղի ընթացքում)։ Ճիշտն է «տրանսֆեր» կամ «տեղափոխություն» (օր. «տրանսֆերի գումարը», «ակումբ տեղափոխվեց», ոչ «փոխանցման գումարը»)։
- Խաղակարգային փուլերի անուններ. «1/8 եզրափակիչ» (round of 16), «1/16 եզրափակիչ» (round of 32), «քառորդ եզրափակիչ» (quarterfinal), «կիսաեզրափակիչ» (semifinal), «եզրափակիչ» (final)։ Առաջին տուրի համար կարող ես գրել նաև «անդրանիկ տուր»։
- Ազգային հավաքական կանչվելը՝ «հրավեր ստանալ» (օր. «ստացավ իր անդրանիկ հրավերը հավաքական»), ոչ պարզապես «կանչվել»։
- Հաջորդ փուլ անցնելը՝ «ուղեգիր նվաճել» (օր. «կիսաեզրափակիչի ուղեգիր նվաճեց»)։
- Նոր խաղացող ձեռք բերելը՝ «համալրում» (օր. «հայտնում է նոր համալրման մասին»)։
- Խաղարկային կազմը՝ «հիմնական կազմ», ոչ «մեկնարկային կազմ»։
- Մամուլի ասուլիս, ոչ «press-conference»/«մամուլի կոնֆերանս»։
- Տուգանային հարվածներով խաղը վճռելը՝ «հետխաղյա 11-մետրանոցներ» կամ «տուգանային հարվածներ», ոչ «պենալտիների սերիա»։
- Հայաստանի ազգային առաջնությունը՝ «Բարձրագույն խումբ», ոչ «Պրեմիեր լիգա» (այն միայն Անգլիայի առաջնության համար է)։

Պատասխանիր ՄԻԱՅՆ JSON օբյեկտով, առանց markdown-ի կամ լրացուցիչ տեքստի, հետևյալ կառուցվածքով.
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
  const { text, debug } = await callModel(SYSTEM_PROMPT, userPrompt, apiKey);
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
  const { text, debug } = await callModel(SYSTEM_PROMPT, userPrompt, apiKey);
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
  const { text, debug } = await callModel(SYSTEM_PROMPT, userPrompt, apiKey);
  lastGenerationDebug = debug;
  if (!text) return null;
  const smartFallback = guessCategory(`${source.title} ${source.snippet}`, "Ֆուտբոլ");
  const parsed = parseArticleJson(text, smartFallback);
  if (!parsed.article) lastGenerationDebug = `parse failed (${parsed.reason}), len=${text.length}, tail=${text.slice(-150)}`;
  return parsed.article;
}
