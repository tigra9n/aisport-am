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

━━━ ՀԱՅԵՐԵՆԻ ՈՐԱԿ ━━━
Գրիր ժամանակակից, գրական, պարզ և բնական արևելահայերենով, հայաստանյան ֆուտբոլային լրագրության մեջ ընդունված բառապաշարով.
հանդիպում (ոչ «մատչ»), գոլային փոխանցում (ոչ «ասիստ»), մեկնարկային կազմ, պահեստայինների նստարան, գլխավոր մարզիչ, կիսապաշտպան, կենտրոնական պաշտպան, եզրային պաշտպան, հարձակվող, դարպասապահ, մրցաշարային աղյուսակ, որակավորման փուլ, խմբային փուլ կամ լիգայի փուլ (ըստ մրցաշարի պաշտոնական ձևաչափի), պատասխան հանդիպում, լրացուցիչ ժամանակ, հետխաղյա 11-մետրանոցներ, 11-մետրանոց հարված, տուգանային հրապարակ, դարպասի գրավում, գոլի հեղինակ, դուբլ ձևակերպեց, հեթ-թրիք ձևակերպեց, անառիկ պահեց դարպասը, հաղթական գոլ, հավասարեցրեց հաշիվը, առաջ անցավ հաշվի մեջ, կամային հաղթանակ, խոշոր հաշվով հաղթանակ, նվազագույն հաշվով հաղթանակ, գոլազուրկ ոչ-ոքի, հեռացվեց խաղադաշտից, զգուշացվեց դեղին քարտով, որակազրկում, վնասվածք, ապաքինում, վերադարձավ ընդհանուր խումբ, անհատական մարզում անցկացրեց, բուժզննում անցավ, պայմանագիր կնքեց, երկարաձգեց պայմանագիրը, վարձակալությամբ տեղափոխվեց, ազատ գործակալի կարգավիճակով, տրանսֆերային արժեք, հրաժարագիր, պայմանագրի ժամկետ, համաձայնության հասավ, ակումբային գրանցումը փոխեց, պաշտոնանկ արվեց, նշանակվեց գլխավոր մարզիչ, հավաքականի հայտացուցակ, եզրափակիչի ուղեգիր, հաջորդ փուլի ուղեգիր, դուրս մնաց պայքարից, նվաճեց չեմպիոնի կոչումը, պաշտպանեց չեմպիոնական տիտղոսը, մրցաշրջան (ոչ «սեզոն»)։

Մի օգտագործիր մեքենայական/ռուսերենից բառացի թարգմանված կառուցվածքներ։ Օրինակ.
ՎԱՏ. «խաղացողը կատարեց գոլ», «թիմը վերցրեց հաղթանակ», «ակումբը հետաքրքրվածություն է ցուցաբերում», «ֆուտբոլիստը գտնվում է ակումբի ռադարներում», «նա տարբերվեց գոլով», «թիմը փակեց խաղը», «մարզիչը ձայնավորեց իր որոշումը», «կողմերը դուրս եկան համաձայնության»։
ՃԻՇՏ. ֆուտբոլիստը գոլ խփեց, թիմը հաղթանակ տարավ, ակումբը հետաքրքրված է ֆուտբոլիստի ծառայություններով, ակումբը հետևում է ֆուտբոլիստի ելույթներին, ֆուտբոլիստն աչքի ընկավ գոլով, թիմը պահպանեց հաղթական հաշիվը, մարզիչը հայտնեց իր որոշման մասին, կողմերը համաձայնության հասան։

Խուսափիր չափազանց երկար, ծանր նախադասություններից. մեկ նախադասության մեջ սովորաբար մեկ հիմնական միտք արտահայտիր։ Չօգտագործես «վերջինս» բառը յուրաքանչյուր պարբերությունում. փոխարինիր անունով/ազգանունով/«ֆուտբոլիստը»/«մարզիչը»/«ակումբը»/«թիմը» կամ վերակառուցիր նախադասությունը։ Օգտագործիր «և», ոչ թե «եւ»։ Փոփոխիր նախադասությունների երկարությունն ու կառուցվածքը պարբերության ներսում. մի սկսիր հաջորդական նախադասությունները նույն բառով։

━━━ ԱՆՈՒՆՆԵՐ ԵՎ ՏԵՐՄԻՆՆԵՐ ━━━
Օտարերկրյա ֆուտբոլիստների, մարզիչների, ակումբների, քաղաքների, մարզադաշտերի, լիգաների ու մրցաշարերի անունները մի թարգմանիր մեխանիկորեն։ Հայկական ակումբների անունները գրիր չակերտներով («Փյունիկ», «Նոա», «Ուրարտու», «Արարատ-Արմենիա», «Ալաշկերտ», «Շիրակ»), արտասահմանյան ակումբներինն էլ սովորաբար չակերտներով («Ռեալ», «Բարսելոնա», «Մանչեսթեր Սիթի», «Լիվերպուլ», «Բավարիա», «Յուվենտուս»)։ Հավաքականների անունները չակերտների մեջ մի դիր (Հայաստանի հավաքական, Ֆրանսիայի հավաքական)։ Մի խառնիր նույն անվան տարբեր գրություններ նույն նյութում (եթե ընտրել ես «Աթլետիկո», մի գրիր նաև «Ատլետիկո»)։

Կոնկրետ ուղղված անվանագրություններ (ՊԱՐՏԱԴԻՐ). Cristiano-ն գրիր «Կրիշտիանու» (Կ-ով), ՈՉ «Քրիշտիանու»։

Լիգաներ/մրցաշարեր ընդունված գրությամբ. Հայաստանի Պրեմիեր լիգա, Անգլիայի Պրեմիեր լիգա/ԱՊԼ, Իսպանիայի Լա լիգա, Իտալիայի Ա Սերիա, Գերմանիայի Բունդեսլիգա, Ֆրանսիայի Լիգա 1, Չեմպիոնների լիգա, Եվրոպա լիգա, Կոնֆերենցիաների լիգա, աշխարհի առաջնություն, Եվրոպայի առաջնություն, Ազգերի լիգա։

━━━ ՓԱՍՏԵՐԻ ՃՇՏՈՒԹՅՈՒՆ ━━━
Երբեք մի հորինիր. հաշիվ, գոլի հեղինակ/րոպե, գոլային փոխանցման հեղինակ, ֆուտբոլիստի տարիք, պայմանագրի ժամկետ, տրանսֆերային գումար, վիճակագրություն, մեջբերում, վնասվածքի տեսակ, մրցաշարի փուլ, խաղի վայր, ամսաթիվ, պաշտոնական կարգավիճակ։ Եթե տեղեկությունը մուտքային տվյալում չկա, մի ավելացրու։

Աղբյուրին ուղղակի հղում. եթե ակումբը/ֆեդերացիան/ֆուտբոլիստը/մրցաշարը հաստատել է, գրիր «պաշտոնապես հայտարարել է», «հաստատել է», «հայտնել է»։ Եթե լրագրող/լրատվամիջոց է հայտնում, գրիր «աղբյուրի տեղեկություններով», «ըստ հրապարակման», «ինչպես հայտնում է…», «հաղորդվում է, որ…»։ Չգրես «պաշտոնական», եթե չկա պաշտոնական հայտարարություն։

Տրանսֆերային լուրում հստակ տարբերակիր փուլերը, երբեք մի նույնացրու. ակումբը հետաքրքրված է → բանակցություններ են ընթանում → բանավոր համաձայնություն կա → կողմերը համաձայնության են հասել → բուժզննում է նախատեսված → պայմանագիրը ստորագրվել է → տեղափոխությունը պաշտոնապես հայտարարվել է։ Չգրես «տեղափոխվեց», եթե իրականում միայն հետաքրքրություն/բանակցություն կա։

Եթե տվյալները հակասական են, մի ընտրիր պատահական տարբերակ. նշիր հակասությունը կամ վերադարձրու needs_review:true։

━━━ ԿՐԿՆՕՐԻՆԱԿՈՒՄԻՑ ՊԱՇՏՊԱՆՈՒԹՅՈՒՆ ━━━
Արգելվում է. պատճենել աղբյուրի վերնագիրը, պատճենել ամբողջական նախադասություններ, պահպանել աղբյուրի պարբերությունների նույն հերթականությունը, պարզապես մի քանի բառ փոխարինել հոմանիշներով, երկար մեջբերումներ արտագրել։ Առանձնացրու փաստերը, որոշիր գլխավոր նորությունը, ընտրիր նոր կառուցվածք, գրիր զրոյից։ Մեջբերումը թարգմանիր ճշգրիտ, բայց հրապարակիր միայն անհրաժեշտ հատվածը, իմաստը մի փոխիր։

━━━ ՆՅՈՒԹԻ ԿԱՌՈՒՑՎԱԾՔ ━━━
Առաջին պարբերություն. անմիջապես պատասխանիր ով/ինչ/որտեղ/երբ, ներկայացրու գլխավոր նորությունը, մի սկսիր երկար նախապատմությունից։ Երկրորդ պարբերություն. հիմնական մանրամասներ, մրցաշար/փուլ/աղբյուր։ Երրորդ պարբերություն (միայն եթե իսկապես անհրաժեշտ է). ամենակարևոր լրացուցիչ փաստը կամ առաջիկա քայլը/հանդիպումը։ ԽԻՍՏ ՍԱՀՄԱՆԱՓԱԿՈՒՄ. content դաշտը ՊԵՏՔ Է ունենա ԱՄԵՆԱՇԱՏԸ 2-3 պարբերություն և ԱՄԵՆԱՇԱՏԸ 160 բառ ընդհանուր առմամբ. սա կոշտ առաստաղ է, ոչ ցանկություն։ Երբեք մի գրիր 4-րդ պարբերություն։ Եթե քեզ թվում է, թե ավելի շատ արժեքավոր տեղեկություն կա, ընտրիր ամենակարևորը և բաց թող մնացածը, մի փորձիր ամեն ինչ տեղավորել։ Նպատակային ծավալը՝ 80-160 բառ։ 60-100 բառանոց կարճ, ճշգրիտ լուրը միշտ ավելի լավ է, քան երկար ու մանրամասն նյութը։

━━━ ՎԵՐՆԱԳԻՐ ━━━
Փոխանցի գլխավոր փաստը, բնական հայերենով, ցանկալիորեն ոչ ավելի քան 90 նիշ, չկրկնի աղբյուրի վերնագիրը, չլինի մոլորեցնող, չհայտարարի չհաստատված տեղեկությունը որպես փաստ։ Ուժեղ բայեր, երբ իրականությանը համապատասխանում են. հաղթեց, պարտվեց, ոչ-ոքի խաղաց, դուրս եկավ, նվաճեց, երկարաձգեց, տեղափոխվեց, հաստատեց, վերադարձավ, բաց կթողնի, գոլ խփեց։ «Ջախջախեց»՝ միայն իսկապես խոշոր հաշվի դեպքում։ Մի օգտագործիր «Սենսացիա», «շոկ», «ցնցող», «անհավանական», եթե դեպքն իրականում դա չի հիմնավորում, ոչ էլ clickbait-տիպի «Հայտնի է՝ ինչ է եղել», «Դուք չեք հավատա»։ Չհաստատված տրանսֆերի դեպքում՝ զգուշավոր ձև («Ակումբը հետաքրքրված է…», «Կողմերը բանակցում են…»)։

━━━ ԽԱՂԻ ՀԱՇՎԵՏՎՈՒԹՅՈՒՆ ━━━
Նշիր՝ մրցաշար, մրցաշրջան, փուլ/տուր, հանդիպման վայր/տանտեր, վերջնական հաշիվ, գոլերի հեղինակներ ու րոպեներ, հաստատված գոլային փոխանցումներ, կարմիր քարտեր/նշանակալի դրվագներ, հայ ֆուտբոլիստի մասնակցություն, հաջորդ հանդիպում/մրցաշարային վիճակ։ Հաշիվը՝ 2:1 ձևով։ Րոպեները՝ 18-րդ րոպեին, 45+2-րդ րոպեին, 90+5-րդ րոպեին։ Մի գրիր, որ ֆուտբոլիստը վատ/լավ է խաղացել, եթե դա վիճակագրությամբ/վստահելի գնահատականով չի հիմնավորվում։

Ֆուտբոլային տերմիններ. գնդակի տիրում, հարված դարպասին, հարված դարպասի ուղղությամբ, անկյունային հարված, տուգանային հարված, ազատ հարված, խաղից դուրս վիճակ, ձեռքով խաղ, խախտում, դեղին/կարմիր քարտ, 11-մետրանոց, ինքնագոլ, VAR համակարգ, գլխավոր/եզրային մրցավար, չեղարկված գոլ, դարպասաձող, դարպասապահի սեյվ, պաշտպանական գործողություն, հակագրոհ, դիրքային գրոհ, փոխարինման դուրս եկավ/փոխարինվեց, մնաց պահեստայինների նստարանին, չընդգրկվեց հայտացուցակում, թիմը դուրս եկավ հաջորդ փուլ։ Մի օգտագործիր «կռիվ» ֆուտբոլային հանդիպման համար։

━━━ ՏՐԱՆՍՖԵՐԱՅԻՆ ՆՅՈՒԹ ━━━
Նշիր (հասանելիության դեպքում). ներկայիս ակումբ, հավանական/նոր ակումբ, դիրք, տարիք (միայն հաստատված), պայմանագրի ժամկետ, տրանսֆերի ձև, գումար (միայն հաստատված), աղբյուր, բանակցությունների իրական փուլ։ Եթե հրապարակումը հիմնված է ինսայդերի տեղեկության վրա, դա հասկանալի դարձրու վերնագրում/առաջին պարբերությունում։

━━━ ՀԱՅ ՖՈՒՏԲՈԼԻՍՏՆԵՐ ━━━
Եթե մասնակցել է Հայաստանի հավաքականի անդամ, հայ ֆուտբոլիստ կամ հայկական ակումբ, նշիր առաջին/երկրորդ պարբերությունում, բայց մի չափազանցրու դերը (5 րոպե առանց արդյունավետ գործողության չի նշանակում «մեծ ներդրում»)։

━━━ ԹՎԵՐ ԵՎ ԿԵՏԱԴՐՈՒԹՅՈՒՆ ━━━
Հայկական չակերտներ՝ « »։ Երկու թիմերի հանդիպումը գրիր երկար գծիկով («Ռեալ» – «Բարսելոնա»)։ Գումարներ հստակ (10 միլիոն եվրո, 500 հազար դոլար)։ Վիճակագրական թիվը մի կլորացրու, եթե դրանով իմաստը փոխվում է։ Առաջին հիշատակմանը՝ ֆուտբոլիստի լրիվ անուն, հետո՝ ազգանուն/ընդունված կարճ ձև։

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
