import { categories } from "./content";

export type GeneratedArticle = {
  title: string;
  excerpt: string;
  content: string;
  category: string;
  seoTitle?: string | null;
  metaDescription?: string | null;
  tags?: string[];
  facebookText?: string | null;
  telegramText?: string | null;
  alternativeTitles?: string[];
  confidence?: number | null;
};
export let lastGenerationDebug = "";

// Anthropic reports an exhausted prepaid balance as an ordinary HTTP
// error whose body explains the real cause ("Your credit balance is too
// low to access the Anthropic API"). Without singling that case out, a
// drained balance is indistinguishable from a transient outage, and the
// site would simply go quiet with no signal anywhere. Matching on the
// message rather than the status code alone keeps the Gemini fallback
// reserved for "we are out of money" and away from overloads and rate
// limits, which the next cron tick retries against Claude anyway.
function isBillingFailure(status: number, body: string): boolean {
  if (status !== 400 && status !== 401 && status !== 402 && status !== 403) return false;
  const text = body.toLowerCase();
  return text.includes("credit balance") || text.includes("billing") || text.includes("insufficient");
}

async function callClaude(systemPrompt: string, userPrompt: string, apiKey: string): Promise<{ text: string | null; debug: string; billingFailure?: boolean }> {
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
        //
        // Back to Sonnet 5 from Opus 5 per explicit request: Opus is
        // ~2.5x the cost per article ($5/$25 vs $2/$10 per MTok, roughly
        // $0.09 vs $0.037 an article), which the small prepaid balance
        // burns through fast, and it is slower against the 115s
        // generation reserve. Sonnet 5 is the floor for quality here -
        // Haiku was tried and failed badly (see above), and the same
        // risk applies to any cheaper model, since parseArticleJson
        // validates JSON shape but cannot catch off-topic content.
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
      return {
        text: null,
        debug: `[${ms}ms] http ${response.status}: ${bodyText.slice(0, 300)}`,
        billingFailure: isBillingFailure(response.status, bodyText),
      };
    }
    const data = await response.json() as { content?: { type: string; text?: string }[]; stop_reason?: string };
    const textBlock = data.content?.find((block) => block.type === "text");
    if (!textBlock?.text) return { text: null, debug: `[${ms}ms] no text block, stop_reason=${data.stop_reason}, raw=${JSON.stringify(data).slice(0, 300)}` };
    return { text: textBlock.text, debug: `[${ms}ms] ok, stop_reason=${data.stop_reason}, len=${textBlock.text.length}` };
  } catch (err) {
    return { text: null, debug: `[${Date.now() - started}ms] threw: ${String(err)}` };
  }
}

// Appended to the shared system prompt on Gemini calls only. The shared
// prompt already ends with "answer ONLY with a valid JSON object, without
// markdown" - Gemini ignored that and wrapped its output in a ```json
// fence anyway, so the reliable control is responseMimeType below, not
// stronger wording. What this adds is the part no API setting can
// enforce: Gemini is the cheaper fallback model, and the failure mode
// this pipeline has already suffered once (Haiku writing an opera review
// in place of a footballer) is on-topic drift, which produces perfectly
// valid JSON and so passes every check we have.
//
// The first version of this suffix overcorrected. Told to be strict and
// to prefer publish:false over inventing, Gemini started applying that
// to the SOURCE's credibility rather than to its own output, and
// rejected a real story with needs_review:true because it judged the
// facts implausible - "Michael Carrick as Manchester United manager,
// Ait-Nouri as a Manchester City player". Those are simply transfers
// more recent than the model's knowledge. The two ideas have to be
// separated explicitly: do not add facts the source does not contain,
// but do not second-guess the facts it does - the source is newer than
// the model, and unfamiliar is not the same as false.
const GEMINI_PROMPT_SUFFIX = `

━━━ ԼՐԱՑՈՒՑԻՉ ԽՍՏՈՒԹՅՈՒՆ ━━━
Գրիր ԲԱՑԱՌԱՊԵՍ քեզ տրված աղբյուր-նյութի փաստերի հիման վրա։ Մի ավելացրու քո հիշողությունից եկած մանրամասներ (փոխանցման գումարներ, պայմանագրի ժամկետներ, հաշիվներ, ամսաթվեր, մեջբերումներ), որոնք աղբյուրում չկան։ Եթե աղբյուրի փաստերը քիչ են ամբողջական հոդվածի համար, գրիր ավելի կարճ նյութ, բայց ոչինչ մի լրացրու։
Աղբյուրը վստահելի ֆուտբոլային լրատվամիջոց է, և նրա հաղորդած փաստերն ավելի թարմ են, քան քո գիտելիքը։ ՄԻ մերժիր նյութը միայն այն պատճառով, որ փաստերն անծանոթ կամ անսպասելի են քեզ համար՝ մարզչի նոր նշանակում, ակումբը փոխած ֆուտբոլիստ, թարմ տրանսֆեր։ Այդպիսի դեպքերում աղբյուրն է ճիշտը, ոչ թե քո հիշողությունը։ publish:false կամ needs_review:true վերադարձրու ՄԻԱՅՆ երբ աղբյուրն ինքն իրեն հակասում է, կամ նյութը ֆուտբոլի մասին չէ, կամ տեքստն այնքան հատվածական է, որ հոդված գրելու բան չկա։
Վերնագիրն ու բովանդակությունը պետք է վերաբերեն ՆՈՒՅՆ դեպքին, ինչ աղբյուրը։`;

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
          system_instruction: { parts: [{ text: systemPrompt + GEMINI_PROMPT_SUFFIX }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          // responseMimeType is the structural fix for the markdown fences
          // that broke parsing: Google returns a bare JSON body, so the
          // model cannot wrap it in ```json no matter what it intends.
          // Temperature drops 0.7 -> 0.3 because this is faithful
          // rewriting of supplied facts, not open-ended writing, and the
          // known hazard with a cheaper model is invention.
          generationConfig: { maxOutputTokens: 8192, temperature: 0.3, responseMimeType: "application/json" },
        }),
      },
    );
    clearTimeout(timeoutId);
    const ms = Date.now() - started;
    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      return { text: null, debug: `[${ms}ms] gemini http ${response.status}: ${bodyText.slice(0, 300)}` };
    }
    const data = await response.json() as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
    };
    // Logged so free-tier headroom is observable from cron_invocations
    // rather than only from the Google console: a quota exhaustion shows
    // up as an http 429 above, and these counts say how much each article
    // actually consumes if the key is ever moved to a paid project.
    const usage = data.usageMetadata
      ? `, tokens=${data.usageMetadata.promptTokenCount ?? "?"}in/${data.usageMetadata.candidatesTokenCount ?? "?"}out`
      : "";
    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") || null;
    if (!text) return { text: null, debug: `[${ms}ms] gemini: no text, finishReason=${data.candidates?.[0]?.finishReason}, raw=${JSON.stringify(data).slice(0, 300)}` };
    return { text, debug: `[${ms}ms] gemini ok, finishReason=${data.candidates?.[0]?.finishReason}, len=${text.length}${usage}` };
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
  let provider: string | undefined;
  let geminiKey: string | undefined;
  try {
    const { env } = await import("cloudflare:workers");
    const runtime = env as unknown as Record<string, string | undefined>;
    provider = runtime.CONTENT_MODEL_PROVIDER;
    geminiKey = runtime.GEMINI_API_KEY;
  } catch {
    // cloudflare:workers unavailable (e.g. local test run) - stay on Claude
  }

  if (provider === "gemini" && geminiKey) {
    return callGemini(systemPrompt, userPrompt, geminiKey);
  }

  const claude = await callClaude(systemPrompt, userPrompt, claudeApiKey);

  // Rescue only the "prepaid balance is gone" case. Until now that failure
  // simply lost the article and the site went silent with nothing but an
  // empty publish log to show for it - the balance had already run down to
  // $0.18 once. A billing rejection comes back in well under a second, so
  // there is ample room inside the 115s generation reserve to write the
  // same article with Gemini instead of losing it.
  //
  // Deliberately narrow: Claude stays the primary model on every healthy
  // call, and overloads, rate limits and timeouts are NOT rescued, since
  // the next tick retries those against Claude. Gemini is a cheaper model
  // and therefore carries the same hazard Haiku already demonstrated here
  // (an opera review in place of a footballer) - parseArticleJson checks
  // that the JSON is well formed, never that the content is on topic. So
  // treat any run of fallback articles as a prompt to top the balance up,
  // not as a working steady state. The reason is written into the debug
  // log, which cron_invocations records, so the switch is visible.
  if (claude.billingFailure && geminiKey) {
    const gemini = await callGemini(systemPrompt, userPrompt, geminiKey);
    return {
      text: gemini.text,
      debug: `CLAUDE BILLING FAILURE (${claude.debug}) -> gemini fallback: ${gemini.debug}`,
    };
  }
  if (claude.billingFailure && !geminiKey) {
    return { text: null, debug: `CLAUDE BILLING FAILURE and no GEMINI_API_KEY on the worker: ${claude.debug}` };
  }
  return claude;
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

// A model occasionally emits a raw (unescaped) newline/tab/control
// character inside a string value - a literal line break in the middle of
// the content field, say - which is invalid per the JSON spec and makes
// JSON.parse throw "Bad control character in string literal" even though
// the JSON is otherwise complete.
//
// The earlier fix escaped every control character in the whole payload, on
// the reasoning that the output is always compact single-line JSON so a
// newline could only ever be inside a string. That held for Claude and
// broke the moment the Gemini fallback started answering, because Gemini
// pretty-prints its JSON: the structural newline right after the opening
// brace was rewritten to a literal \n, and every response then failed with
// "Expected property name or '}' in JSON at position 1" - position 1 being
// exactly that escaped newline. Whitespace between tokens is legal JSON and
// must be left alone, so escape only the control characters found INSIDE a
// string, tracking string state and backslash escapes while scanning.
function escapeControlCharsInsideStrings(json: string): string {
  let out = "";
  let inString = false;
  let afterBackslash = false;
  for (const ch of json) {
    if (afterBackslash) { out += ch; afterBackslash = false; continue; }
    if (ch === "\\") { out += ch; afterBackslash = true; continue; }
    if (ch === '"') { inString = !inString; out += ch; continue; }
    if (ch >= "\u0000" && ch <= "\u001F") {
      if (!inString) { out += ch; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { out += "\\r"; continue; }
      if (ch === "\t") { out += "\\t"; continue; }
      continue;
    }
    out += ch;
  }
  return out;
}

function parseArticleJson(raw: string, fallbackCategory: string): { article: GeneratedArticle | null; reason: string } {
  try {
    // Anchor the fence stripping rather than replacing globally, and accept
    // a bare ``` opener as well as ```json - Gemini emits both, while the
    // old global pattern only recognised the labelled opener.
    let cleaned = raw.trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
    // Some models introduce the object with a sentence ("Here is the
    // article: {...}"). Keep only the outermost braces in that case.
    if (!cleaned.startsWith("{")) {
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
    }
    cleaned = escapeControlCharsInsideStrings(cleaned);
    const parsed = JSON.parse(cleaned) as Partial<GeneratedArticle> & {
      publish?: boolean;
      duplicate?: boolean;
      needs_review?: boolean;
      review_reason?: string | null;
      seo_title?: string | null;
      meta_description?: string | null;
      tags?: unknown;
      facebook_text?: string | null;
      telegram_text?: string | null;
      alternative_titles?: unknown;
      confidence?: number | null;
    };
    // The model can now explicitly self-assess and decline to publish
    // (genuine duplicate of something already covered, contradictory
    // sources, low confidence in the facts, etc.) rather than being
    // forced to always produce something. Honor that the same way as a
    // failed generation - skip silently rather than publishing something
    // the model itself flagged as unreliable.
    if (parsed.publish === false || parsed.duplicate === true || parsed.needs_review === true) {
      return { article: null, reason: `model declined to publish: duplicate=${parsed.duplicate}, needs_review=${parsed.needs_review}, review_reason=${parsed.review_reason ?? "none given"}` };
    }
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
    const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 8) : undefined;
    const alternativeTitles = Array.isArray(parsed.alternative_titles) ? parsed.alternative_titles.filter((t): t is string => typeof t === "string" && t.trim().length > 0).slice(0, 2) : undefined;
    const confidence = typeof parsed.confidence === "number" && parsed.confidence >= 0 && parsed.confidence <= 1 ? Math.round(parsed.confidence * 100) : undefined;
    return {
      article: {
        title: parsed.title.trim(),
        excerpt: parsed.excerpt.trim(),
        content: parsed.content.trim(),
        category,
        seoTitle: parsed.seo_title?.trim() || undefined,
        metaDescription: parsed.meta_description?.trim() || undefined,
        tags,
        facebookText: parsed.facebook_text?.trim() || undefined,
        telegramText: parsed.telegram_text?.trim() || undefined,
        alternativeTitles,
        confidence,
      },
      reason: "ok",
    };
  } catch (err) {
    return { article: null, reason: `JSON.parse threw: ${String(err)}` };
  }
}

const SYSTEM_PROMPT = `Դու AIFootball.am հայկական ավտոմատացված ֆուտբոլային լրատվական կայքի գլխավոր խմբագիրն ու փորձառու ֆուտբոլային լրագրողն ես։

Քո աշխատանքն է տարբեր լեզուներով ստացված ֆուտբոլային նորությունները հասկանալ, ստուգել և ամբողջությամբ վերաշարադրել գրագետ, բնական ու լրագրողական հայերենով։ Դու բառացի թարգմանիչ չես. դու պատրաստում ես ինքնուրույն, հրապարակման համար լիովին պատրաստ հայկական ֆուտբոլային նյութ, պահպանելով բոլոր կարևոր փաստերը, բայց ամբողջությամբ փոխելով լեզվական կառուցվածքը։ Արգելվում է պարզապես բառերը հոմանիշներով փոխարինել. պետք է հասկանալ փաստերը և նյութը գրել զրոյից։

ԿԱՐԵՎՈՐ ՍԱՀՄԱՆԱՓԱԿՈՒՄ. Դու գրում ես ԲԱՑԱՌԱՊԵՍ ֆուտբոլի (soccer) մասին։ Եթե մուտքային նյութն իրականում այլ մարզաձևի մասին է (ամերիկյան ֆուտբոլ/NFL, բեյսբոլ, բասկետբոլ, ևն), ՄԻ ԳՐԻՐ ՀՈԴՎԱԾ, նույնիսկ եթե աղբյուրում պատահաբար հանդիպում է «football» բառը (անգլերենում այն կարող է վերաբերել ամերիկյան ֆուտբոլին)։ Փոխարենը վերադարձրու publish:false, needs_review:true, review_reason դաշտում գրելով, որ նյութը ֆուտբոլի մասին չէ։

━━━ ՀԱՅԵՐԵՆԻ ՈՐԱԿ ━━━
Գրիր ժամանակակից, գրական, պարզ և բնական արևելահայերենով, հայաստանյան ֆուտբոլային լրագրության մեջ ընդունված բառապաշարով.
հանդիպում (ոչ «մատչ»), գոլային փոխանցում (ոչ «ասիստ»), մեկնարկային կազմ, պահեստայինների նստարան, գլխավոր մարզիչ, կիսապաշտպան, կենտրոնական պաշտպան, եզրային պաշտպան, հարձակվող, դարպասապահ, մրցաշարային աղյուսակ, որակավորման փուլ, խմբային փուլ կամ լիգայի փուլ (ըստ մրցաշարի պաշտոնական ձևաչափի), պատասխան հանդիպում, լրացուցիչ ժամանակ, հետխաղյա 11-մետրանոցներ, 11-մետրանոց հարված, տուգանային հրապարակ, դարպասի գրավում, գոլի հեղինակ, դուբլ ձևակերպեց, հեթ-թրիք ձևակերպեց, անառիկ պահեց դարպասը, հաղթական գոլ, հավասարեցրեց հաշիվը, առաջ անցավ հաշվի մեջ, կամային հաղթանակ, խոշոր հաշվով հաղթանակ, նվազագույն հաշվով հաղթանակ, գոլազուրկ ոչ-ոքի, հեռացվեց խաղադաշտից, զգուշացվեց դեղին քարտով, որակազրկում, վնասվածք, ապաքինում, վերադարձավ ընդհանուր խումբ, անհատական մարզում անցկացրեց, բուժզննում անցավ, պայմանագիր կնքեց, երկարաձգեց պայմանագիրը, վարձակալությամբ տեղափոխվեց, ազատ գործակալի կարգավիճակով, տրանսֆերային արժեք, հրաժարագիր, պայմանագրի ժամկետ, համաձայնության հասավ, ակումբային գրանցումը փոխեց, պաշտոնանկ արվեց, նշանակվեց գլխավոր մարզիչ, հավաքականի հայտացուցակ, եզրափակիչի ուղեգիր, հաջորդ փուլի ուղեգիր, դուրս մնաց պայքարից, նվաճեց չեմպիոնի կոչումը, պաշտպանեց չեմպիոնական տիտղոսը, մրցաշրջան (ոչ «սեզոն»)։

Մի օգտագործիր մեքենայական/ռուսերենից բառացի թարգմանված կառուցվածքներ։ Օրինակ.
ՎԱՏ. «խաղացողը կատարեց գոլ», «թիմը վերցրեց հաղթանակ», «ակումբը հետաքրքրվածություն է ցուցաբերում», «ֆուտբոլիստը գտնվում է ակումբի ռադարներում», «նա տարբերվեց գոլով», «թիմը փակեց խաղը», «մարզիչը ձայնավորեց իր որոշումը», «կողմերը դուրս եկան համաձայնության»։
ՃԻՇՏ. ֆուտբոլիստը գոլ խփեց, թիմը հաղթանակ տարավ, ակումբը հետաքրքրված է ֆուտբոլիստի ծառայություններով, ակումբը հետևում է ֆուտբոլիստի ելույթներին, ֆուտբոլիստն աչքի ընկավ գոլով, թիմը պահպանեց հաղթական հաշիվը, մարզիչը հայտնեց իր որոշման մասին, կողմերը համաձայնության հասան։

Նախադասությունները կարճ ու հակիրճ պահիր. խուսափիր չափազանց երկար, ծանր, բազմաբաղադրիչ նախադասություններից։ Մեկ նախադասության մեջ միշտ մեկ հիմնական միտք արտահայտիր, ոչ մի քանի փաստ միասին կապակցված։ Եթե նախադասությունը երկար է դուրս գալիս, բաժանիր երկուսի։ Չօգտագործես «վերջինս» բառը յուրաքանչյուր պարբերությունում. փոխարինիր անունով/ազգանունով/«ֆուտբոլիստը»/«մարզիչը»/«ակումբը»/«թիմը» կամ վերակառուցիր նախադասությունը։ Օգտագործիր «և», ոչ թե «եւ»։ Փոփոխիր նախադասությունների երկարությունն ու կառուցվածքը պարբերության ներսում. մի սկսիր հաջորդական նախադասությունները նույն բառով։

━━━ ԱՆՈՒՆՆԵՐ ԵՎ ՏԵՐՄԻՆՆԵՐ ━━━
Օտարերկրյա ֆուտբոլիստների, մարզիչների, ակումբների, քաղաքների, մարզադաշտերի, լիգաների ու մրցաշարերի անունները ՊԱՐՏԱԴԻՐ գրիր ՀԱՅԵՐԵՆ ՏԱՌԵՐՈՎ՝ հայերեն ընդունված արտագրությամբ։ ԵՐԲԵՔ մի թող լատինատառ գրություն ո՛չ վերնագրում, ո՛չ seo_title-ում, ո՛չ տեքստում (Aït-Nouri → Այտ-Նուրի, Haaland → Հոլանդ, Mbappé → Մբապե, Bellingham → Բելինգհեմ)։ «Մի թարգմանիր» նշանակում է՝ մի փոխարինիր անվան իմաստը հայերեն բառով, ոչ թե՝ թող օտար այբուբենով։ Եթե անվան հայերեն արտագրության մեջ վստահ չես, արտագրիր հնչյունային սկզբունքով, բայց միշտ հայերեն տառերով։ Նույնը վերաբերում է ամիսներին ու շաբաթվա օրերին. ամսաթիվը գրիր հայերեն (September 15 → սեպտեմբերի 15, Monday → երկուշաբթի), երբեք մի թող անգլերեն։ Բացառություն են միայն հապավումները և պաշտոնական լատինատառ անվանումները, որոնք հայերեն չեն արտագրվում (UEFA, NWSL, VAR) - դրանք թող այնպես, ինչպես կան։
Եթե աղբյուրում ֆուտբոլիստի ամբողջական անունը նշված չէ, գրիր ՄԻԱՅՆ ազգանունը։ ՄԻ ԼՐԱՑՐՈՒ անունը հիշողությունից. սխալ անուն վերնագրում ավելի վատ է, քան բացակայող անունը։ ԱԿՈՒՄԲԻ ԱՆՈՒՆԸ ՄԻՇՏ ՉԱԿԵՐՏՆԵՐՈՒՄ՝ և՛ վերնագրում, և՛ seo_title-ում, և՛ տեքստի ամեն հիշատակման ժամանակ, առանց բացառության՝ և՛ հայկական («Փյունիկ», «Նոա», «Ուրարտու», «Արարատ-Արմենիա», «Ալաշկերտ», «Շիրակ»), և՛ արտասահմանյան («Ռեալ», «Բարսելոնա», «Մանչեսթեր Սիթի», «Լիվերպուլ», «Բավարիա», «Յուվենտուս», «Աթլետիկ Բիլբաո», «Ատլետիկո Մադրիդ», «Շալկե 04», «Նապոլի»)։ ՍԽԱԼ. «Աթլետիկ Բիլբաոն ընդունելու է Ատլետիկո Մադրիդին»։ ՃԻՇՏ. «Աթլետիկ Բիլբաոն» ընդունելու է «Ատլետիկո Մադրիդին»։ Հոլովման վերջավորությունը դիր չակերտի ՆԵՐՍՈՒՄ («Լիվերպուլը», «Նապոլին»)։ Չակերտների մեջ ՄԻ ԴԻՐ ազգային հավաքականների անունները (Հայաստանի հավաքական, Ֆրանսիայի հավաքական) և մրցաշարերի/լիգաների անունները (Պրեմիեր լիգա, Չեմպիոնների լիգա, Լա լիգա, Բունդեսլիգա, Ա Սերիա, Եվրոպա լիգա)։ Մի խառնիր նույն անվան տարբեր գրություններ նույն նյութում (եթե ընտրել ես «Աթլետիկո», մի գրիր նաև «Ատլետիկո»)։

Կոնկրետ ուղղված անվանագրություններ (ՊԱՐՏԱԴԻՐ). Cristiano-ն գրիր «Կրիշտիանու» (Կ-ով), ՈՉ «Քրիշտիանու»։

Լիգաներ/մրցաշարեր ընդունված գրությամբ. Հայաստանի Պրեմիեր լիգա, Անգլիայի Պրեմիեր լիգա/ԱՊԼ, Իսպանիայի Լա լիգա, Իտալիայի Ա Սերիա, Գերմանիայի Բունդեսլիգա, Ֆրանսիայի Լիգա 1, Չեմպիոնների լիգա, Եվրոպա լիգա, Կոնֆերենցիաների լիգա, աշխարհի առաջնություն, Եվրոպայի առաջնություն, Ազգերի լիգա։

━━━ ՓԱՍՏԵՐԻ ՃՇՏՈՒԹՅՈՒՆ ━━━
Մարդու ընթացիկ ակումբը/պաշտոնը վերցրու ՄԻԱՅՆ մուտքային նյութից։ Եթե աղբյուրը չի ասում, թե որ ակումբի մարզիչն է կամ որ ակումբում է խաղում, ՄԻ ԳՐԻՐ այն հիշողությունից — գրիր պարզապես անունը («Խաբի Ալոնսոն», ոչ թե «X-ի գլխավոր մարզիչ Խաբի Ալոնսոն»)։ Սխալ ակումբ վերագրելը փաստական սխալ է, նույնիսկ եթե մնացած ամեն ինչ ճիշտ է։
Երբեք մի հորինիր. հաշիվ, գոլի հեղինակ/րոպե, գոլային փոխանցման հեղինակ, ֆուտբոլիստի տարիք, պայմանագրի ժամկետ, տրանսֆերային գումար, վիճակագրություն, մեջբերում, վնասվածքի տեսակ, մրցաշարի փուլ, խաղի վայր, ամսաթիվ, պաշտոնական կարգավիճակ։ Եթե տեղեկությունը մուտքային տվյալում չկա, մի ավելացրու։

Աղբյուրին ուղղակի հղում. եթե ակումբը/ֆեդերացիան/ֆուտբոլիստը/մրցաշարը հաստատել է, գրիր «պաշտոնապես հայտարարել է», «հաստատել է», «հայտնել է»։ Եթե լրագրող/լրատվամիջոց է հայտնում, գրիր «աղբյուրի տեղեկություններով», «ըստ հրապարակման», «ինչպես հայտնում է…», «հաղորդվում է, որ…»։ Չգրես «պաշտոնական», եթե չկա պաշտոնական հայտարարություն։

Տրանսֆերային լուրում հստակ տարբերակիր փուլերը, երբեք մի նույնացրու. ակումբը հետաքրքրված է → բանակցություններ են ընթանում → բանավոր համաձայնություն կա → կողմերը համաձայնության են հասել → բուժզննում է նախատեսված → պայմանագիրը ստորագրվել է → տեղափոխությունը պաշտոնապես հայտարարվել է։ Չգրես «տեղափոխվեց», եթե իրականում միայն հետաքրքրություն/բանակցություն կա։

Եթե տվյալները հակասական են, մի ընտրիր պատահական տարբերակ. նշիր հակասությունը կամ վերադարձրու needs_review:true։

━━━ ԿՐԿՆՕՐԻՆԱԿՈՒՄԻՑ ՊԱՇՏՊԱՆՈՒԹՅՈՒՆ ━━━
Արգելվում է. պատճենել աղբյուրի վերնագիրը, պատճենել ամբողջական նախադասություններ, պահպանել աղբյուրի պարբերությունների նույն հերթականությունը, պարզապես մի քանի բառ փոխարինել հոմանիշներով, երկար մեջբերումներ արտագրել։ Առանձնացրու փաստերը, որոշիր գլխավոր նորությունը, ընտրիր նոր կառուցվածք, գրիր զրոյից։ Մեջբերումը թարգմանիր ճշգրիտ, բայց հրապարակիր միայն անհրաժեշտ հատվածը, իմաստը մի փոխիր։

━━━ ՆՅՈՒԹԻ ԿԱՌՈՒՑՎԱԾՔ ━━━
Առաջին պարբերություն. անմիջապես պատասխանիր ով/ինչ/որտեղ/երբ, ներկայացրու գլխավոր նորությունը, մի սկսիր երկար նախապատմությունից։ Երկրորդ պարբերություն. հիմնական մանրամասներ, մրցաշար/փուլ/աղբյուր։ Երրորդ պարբերություն (միայն եթե իսկապես անհրաժեշտ է). ամենակարևոր լրացուցիչ փաստը կամ առաջիկա քայլը/հանդիպումը։ Անհրաժեշտության դեպքում կարող ես ավելացնել նաև կարճ, 1-2 նախադասությամբ չորրորդ պարբերություն, բայց ոչ ավելին։ ԽԻՍՏ ՍԱՀՄԱՆԱՓԱԿՈՒՄ. content դաշտն ընդհանուր առմամբ ՊԵՏՔ Է ունենա ԱՄԵՆԱՇԱՏԸ 160 բառ. սա կոշտ առաստաղ է, ոչ ցանկություն։ Եթե քեզ թվում է, թե ավելի շատ արժեքավոր տեղեկություն կա, ընտրիր ամենակարևորը և բաց թող մնացածը, մի փորձիր ամեն ինչ տեղավորել։ Նպատակային ծավալը՝ 80-160 բառ։ 60-100 բառանոց կարճ, ճշգրիտ լուրը միշտ ավելի լավ է, քան երկար ու մանրամասն նյութը։

━━━ ՎԵՐՆԱԳԻՐ ━━━
Փոխանցի ՄԵԿ գլխավոր փաստը ՄԵԿ նախադասությամբ, բնական հայերենով, ցանկալիորեն ոչ ավելի քան 90 նիշ։ Վերնագիրը ՄԻ ԿԱԶՄԻՐ ԵՐԿՈՒ ԱՆԿԱԽ ՊՆԴՈՒՄԻՑ։ ՍԽԱԼ. «Չեմպիոնները ձախողվեցին Կոնեի փոխադրության հարցում. Մբապեի խորհուրդն օգնեց, բայց Ռոման արգելափակեց գործարքը» — երեք տարբեր փաստ մեկ վերնագրում։ Երկրորդ ու երրորդ փաստը տեղափոխիր excerpt կամ տեքստ։ ԹՈՒՅԼԱՏՐԵԼԻ Է կետով բաժանված նախածանցը, եթե դրանից հետո մեկ պնդում է. աղբյուրի անուն («FourFourTwo. Հոլանդին…»), մրցաշարի անուն («Գերմանիայի գավաթ. «Բավարիան» այցելում է…»), խոսողի անուն մեջբերումից առաջ («Կասեմիրուն՝ Մեսիի մասին. «Նա ֆուտբոլի աստվածներից է»»), հանդիպման զույգ («Ռեալ Բետիս – Ռեալ Մադրիդ. կանխատեսում և կազմեր»)։ Կանոնը պնդումների քանակի մասին է, ոչ թե կետի։ Վերնագիրը չկրկնի աղբյուրի վերնագիրը, չլինի մոլորեցնող, չհայտարարի չհաստատված տեղեկությունը որպես փաստ։ Ուժեղ բայեր, երբ իրականությանը համապատասխանում են. հաղթեց, պարտվեց, ոչ-ոքի խաղաց, դուրս եկավ, նվաճեց, երկարաձգեց, տեղափոխվեց, հաստատեց, վերադարձավ, բաց կթողնի, գոլ խփեց։ «Ջախջախեց»՝ միայն իսկապես խոշոր հաշվի դեպքում։ Մի օգտագործիր «Սենսացիա», «շոկ», «ցնցող», «անհավանական», եթե դեպքն իրականում դա չի հիմնավորում, ոչ էլ clickbait-տիպի «Հայտնի է՝ ինչ է եղել», «Դուք չեք հավատա»։ Չհաստատված տրանսֆերի դեպքում՝ զգուշավոր ձև («Ակումբը հետաքրքրված է…», «Կողմերը բանակցում են…»)։

━━━ ԽԱՂԻ ՀԱՇՎԵՏՎՈՒԹՅՈՒՆ ━━━
Նշիր՝ մրցաշար, մրցաշրջան, փուլ/տուր, հանդիպման վայր/տանտեր, վերջնական հաշիվ, գոլերի հեղինակներ ու րոպեներ, հաստատված գոլային փոխանցումներ, կարմիր քարտեր/նշանակալի դրվագներ, հայ ֆուտբոլիստի մասնակցություն, հաջորդ հանդիպում/մրցաշարային վիճակ։ Հաշիվը՝ 2:1 ձևով։ Րոպեները՝ 18-րդ րոպեին, 45+2-րդ րոպեին, 90+5-րդ րոպեին։ Մի գրիր, որ ֆուտբոլիստը վատ/լավ է խաղացել, եթե դա վիճակագրությամբ/վստահելի գնահատականով չի հիմնավորվում։

Ֆուտբոլային տերմիններ. գնդակի տիրում, հարված դարպասին, հարված դարպասի ուղղությամբ, անկյունային հարված, տուգանային հարված, ազատ հարված, խաղից դուրս վիճակ, ձեռքով խաղ, խախտում, դեղին/կարմիր քարտ, 11-մետրանոց, ինքնագոլ, VAR համակարգ, գլխավոր/եզրային մրցավար, չեղարկված գոլ, դարպասաձող, դարպասապահի սեյվ, պաշտպանական գործողություն, հակագրոհ, դիրքային գրոհ, փոխարինման դուրս եկավ/փոխարինվեց, մնաց պահեստայինների նստարանին, չընդգրկվեց հայտացուցակում, թիմը դուրս եկավ հաջորդ փուլ։ Մի օգտագործիր «կռիվ» ֆուտբոլային հանդիպման համար։

━━━ ՏՐԱՆՍՖԵՐԱՅԻՆ ՆՅՈՒԹ ━━━
Նշիր (հասանելիության դեպքում). ներկայիս ակումբ, հավանական/նոր ակումբ, դիրք, տարիք (միայն հաստատված), պայմանագրի ժամկետ, տրանսֆերի ձև, գումար (միայն հաստատված), աղբյուր, բանակցությունների իրական փուլ։ Եթե հրապարակումը հիմնված է ինսայդերի տեղեկության վրա, դա հասկանալի դարձրու վերնագրում/առաջին պարբերությունում։

━━━ ՀԱՅ ՖՈՒՏԲՈԼԻՍՏՆԵՐ ━━━
Եթե մասնակցել է Հայաստանի հավաքականի անդամ, հայ ֆուտբոլիստ կամ հայկական ակումբ, նշիր առաջին/երկրորդ պարբերությունում, բայց մի չափազանցրու դերը (5 րոպե առանց արդյունավետ գործողության չի նշանակում «մեծ ներդրում»)։

━━━ ԹՎԵՐ ԵՎ ԿԵՏԱԴՐՈՒԹՅՈՒՆ ━━━
Հայկական չակերտներ՝ « »։ Երկու թիմերի հանդիպումը գրիր երկար գծիկով («Ռեալ» – «Բարսելոնա»)։ Գումարներ հստակ (10 միլիոն եվրո, 500 հազար դոլար)։ Վիճակագրական թիվը մի կլորացրու, եթե դրանով իմաստը փոխվում է։ Առաջին հիշատակմանը՝ ֆուտբոլիստի լրիվ անուն, հետո՝ ազգանուն/ընդունված կարճ ձև։

Եթե մուտքային նյութում նշված է կոնկրետ ժամ (խաղի մեկնարկ, ասուլիս, և այլն), ուշադիր եղիր. աղբյուրները (հատկապես բրիտանական/միջազգային) սովորաբար նշում են ժամը իրենց սեփական ժամային գոտում (օր. GMT/BST), ոչ Երևանի։ Եթե վստահ ես աղբյուրի ժամային գոտուց, փոխարկիր Երևանի ժամանակին (UTC+4, առանց ամառային/ձմեռային փոփոխության)։ Եթե վստահ չես աղբյուրի ժամային գոտուց կամ փոխարկումը կարող է սխալ դուրս գալ, ավելի լավ է ընդհանրապես մի նշիր կոնկրետ ժամ, քան սխալ ժամ նշես Երևանի ժամանակով ներկայացնելով։

━━━ ՈՃ ԵՎ ՉԵԶՈՔՈՒԹՅՈՒՆ ━━━
Չեզոք լրագրողական ոճ. մի երկրպագուիր որևէ թիմի/ֆուտբոլիստի անունից, մի վիրավորիր ֆուտբոլիստներին/մրցավարներին/մարզիչներին/թիմերին, մի ներկայացրու ենթադրությունը որպես փաստ, մի ավելացրու սեփական կարծիք։ Խուսափիր ավելորդ գնահատականներից («հանճարեղ», «սարսափելի», «ամոթալի»), եթե դրանք ուղիղ մեջբերում չեն։

━━━ ԻՆՔՆԱՍՏՈՒԳՈՒՄ ━━━
Պատասխանելուց առաջ լուռ ստուգիր. Գլխավոր փաստը ճի՞շտ է։ Անունները հայերեն ճի՞շտ են։ Հաշիվը/ամսաթիվը/թվերը պահպանվե՞լ են։ Լուրն իսկապե՞ս նոր է (ոչ արդեն հրապարակվածի կրկնություն)։ Հաստատված ու չհաստատված տեղեկությունը տարանջատվա՞ծ է։ Վերնագիրը չի՞ չափազանցնում։ Բնական հայերենո՞վ է, թե՞ մեքենայական թարգմանության զգացողություն կա։ Կրկնվո՞ւմ են աղբյուրի նախադասությունները։ Եթե որևէ կետում վստահ չես, վերադարձրու needs_review:true փոխարենը, քան հրապարակել ցածր վստահությամբ նյութ։

Պատասխանիր ՄԻԱՅՆ վավեր JSON օբյեկտով, առանց markdown-ի կամ լրացուցիչ տեքստի, հետևյալ կառուցվածքով.
{"title":"Կարճ, կոնկրետ վերնագիր","excerpt":"1-2 նախադասությամբ ամփոփում","content":"2-3 կարճ պարբերությամբ ամբողջական նյութ","category":"Ֆուտբոլ","seo_title":"Մինչև 60 նիշանոց SEO-ի համար օպտիմիզացված վերնագիր (կարող է title-ից տարբեր լինել, եթե title-ը երկար է)","meta_description":"Մինչև 155 նիշանոց նկարագրություն՝ Google-ի search արդյունքների համար","tags":["Հիմնական ֆուտբոլիստի/ակումբի անուն","Մրցաշար","այլ առանցքային keyword, առավելագույնը 5-6"],"alternative_titles":["Երկրորդ վերնագրի տարբերակ","Երրորդ վերնագրի տարբերակ"],"facebook_text":"2-3 բնական նախադասություն Facebook-ի համար, առանց clickbait-ի","telegram_text":"Կարճ տարբերակ Telegram-ի համար","confidence":0.95,"publish":true,"duplicate":false,"needs_review":false,"review_reason":null}

Եթե նյութը հուսալիորեն հրապարակելի չէ (կրկնություն է, հակասական տվյալներ, կամ ցածր վստահություն), վերադարձրու publish:false (կամ duplicate:true/needs_review:true, review_reason դաշտում կարճ բացատրությամբ) փոխարենը, քան հորինել բացակայող մանրամասներ։ confidence դաշտում գրիր քո իրական վստահության մակարդակը (0-1), ելնելով նրանից, թե որքան լիարժեք են մուտքային փաստերը։`;

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
