export type GeneratedArticle = { title: string; excerpt: string; content: string; category: string };

async function callClaude(systemPrompt: string, userPrompt: string, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 900,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!response.ok) {
      console.error(`[content-gen] Claude API error ${response.status}: ${await response.text().catch(() => "")}`);
      return null;
    }
    const data = await response.json() as { content?: { type: string; text?: string }[] };
    const textBlock = data.content?.find((block) => block.type === "text");
    return textBlock?.text ?? null;
  } catch (err) {
    console.error(`[content-gen] Claude API call threw: ${String(err)}`);
    return null;
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
): Promise<GeneratedArticle | null> {
  const eventsText = events.length
    ? events.map((e) => `${e.minute} ${e.team}՝ ${e.label}${e.player !== "—" ? ` (${e.player})` : ""}`).join("\n")
    : "Իրադարձությունների մանրամասն տվյալ չկա։";
  const userPrompt = `Գրիր կարճ (150-250 բառ) recap հոդված այս խաղի արդյունքից.
Մրցաշար՝ ${match.competition}
${match.home} ${match.homeScore} : ${match.awayScore} ${match.away}
Մարզադաշտ՝ ${match.venue}
Իրադարձություններ.
${eventsText}

Հենվիր միայն այս փաստերի վրա, ոչինչ մի հորինիր (խաղացողների անուններ, գումարներ և այլն, որ չկան տվյալների մեջ)։ category դաշտում գրիր "Ֆուտբոլ"։`;
  const raw = await callClaude(SYSTEM_PROMPT, userPrompt, apiKey);
  return raw ? parseArticleJson(raw, "Ֆուտբոլ") : null;
}

export async function generateMatchPreview(
  apiKey: string,
  match: { home: string; away: string; competition: string; kickoff: string },
  context: { h2h?: string; homeForm?: string; awayForm?: string },
): Promise<GeneratedArticle | null> {
  const contextLines = [
    context.h2h ? `Նախկին հանդիպումներ՝ ${context.h2h}` : null,
    context.homeForm ? `${match.home}-ի վերջին ձևը՝ ${context.homeForm}` : null,
    context.awayForm ? `${match.away}-ի վերջին ձևը՝ ${context.awayForm}` : null,
  ].filter(Boolean).join("\n");
  const userPrompt = `Գրիր կարճ (120-200 բառ) preview հոդված այս առաջիկա խաղից.
Մրցաշար՝ ${match.competition}
${match.home} - ${match.away}
Ժամանակ՝ ${match.kickoff}
${contextLines || "Լրացուցիչ վիճակագրություն չկա։"}

Հենվիր միայն այս փաստերի վրա, ոչինչ մի հորինիր։ category դաշտում գրիր "Ֆուտբոլ"։`;
  const raw = await callClaude(SYSTEM_PROMPT, userPrompt, apiKey);
  return raw ? parseArticleJson(raw, "Ֆուտբոլ") : null;
}

export async function generateFromSourceSnippet(
  apiKey: string,
  source: { title: string; snippet: string; sourceName: string },
): Promise<GeneratedArticle | null> {
  const userPrompt = `Ստորև տրված է սպորտային նորության վերնագիր և կարճ նկարագրություն (ոչ ամբողջ նյութ)՝ ${source.sourceName}-ից.
Վերնագիր՝ ${source.title}
Նկարագրություն՝ ${source.snippet}

Այս փաստերի հիման վրա գրիր ԱՄԲՈՂՋՈՎԻՆ ինքնուրույն, հայերեն նյութ (120-200 բառ)՝ քո սեփական բառերով, ո՛չ թարգմանություն, ո՛չ մոտ-պարաֆրազ։ Մի մեջբերիր ուղիղ արտահայտություններ բնագրից։ Եթե նկարագրությունը բավարար փաստ չի տալիս ամբողջական հոդված գրելու համար, գրիր ավելի կարճ, բայց ճշգրիտ ամփոփում։ category դաշտում գրիր ամենահարմար մարզաձևի անունը (Ֆուտբոլ, Բասկետբոլ, Թենիս, և այլն)։`;
  const raw = await callClaude(SYSTEM_PROMPT, userPrompt, apiKey);
  return raw ? parseArticleJson(raw, "Ֆուտբոլ") : null;
}
