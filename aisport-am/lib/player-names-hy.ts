// Player names in Armenian.
//
// The top-scorer table printed "Haaland", "Saka", "Bruno Fernandes" in
// Latin on a page that is Armenian everywhere else, including in the
// articles about those same players.
//
// The table comes first and always wins. A name is somebody's name, and no
// rule can know whether "Haaland" is "Հալանդ" or "Հաալանդ" - so every name
// worth getting right is spelled out here.
//
// What the table cannot do is cover a squad list: Manchester City showed 23
// of its 26 players in Latin, and there are hundreds of clubs. A name that
// is not here now falls through to transliterateName(), which spells it out
// by rule. That is a fallback and not a replacement - it will not always
// match how a commentator says the name - but an approximate Armenian
// spelling is more use to a reader of an Armenian site than Latin script,
// and anything it gets wrong is fixed by adding the name above.
import { transliterateName } from "./translit-hy";

const playerNames: Record<string, string> = {
  // Premier League
  "erling haaland": "Էրլինգ Հալանդ", "mohamed salah": "Մոհամեդ Սալահ",
  "bukayo saka": "Բուկայո Սակա", "cole palmer": "Քոուլ Փալմեր",
  "bruno fernandes": "Բրունո Ֆերնանդեշ", "harry kane": "Հարրի Քեյն",
  "son heung-min": "Սոն Հին Մին", "alexander isak": "Ալեքսանդեր Իսակ",
  "ollie watkins": "Օլլի Ուոթկինս", "phil foden": "Ֆիլ Ֆոդեն",
  "declan rice": "Դեկլան Ռայս", "martin odegaard": "Մարտին Էդեգոր",
  "anthony elanga": "Էնթոնի Էլանգա", "rodri": "Ռոդրի",
  "virgil van dijk": "Վիրջիլ վան Դեյք", "william saliba": "Ուիլյամ Սալիբա",
  "kai havertz": "Կայ Հավերց", "darwin nunez": "Դարվին Նունյես",
  "dominik szoboszlai": "Դոմինիկ Սոբոսլաի", "nicolas jackson": "Նիկոլա Ջեքսոն",
  "jarrod bowen": "Ջարրոդ Բոուեն", "yoane wissa": "Յոան Վիսսա",
  "jean-philippe mateta": "Ժան-Ֆիլիպ Մատետա", "chris wood": "Քրիս Վուդ",
  // La Liga
  "kylian mbappe": "Կիլիան Մբապե", "lamine yamal": "Լամին Յամալ",
  "robert lewandowski": "Ռոբերտ Լևանդովսկի", "vinicius junior": "Վինիսիուս Ժունիոր",
  "jude bellingham": "Ջուդ Բելինգհեմ", "raphinha": "Ռաֆինյա",
  "antoine griezmann": "Անտուան Գրիզման", "julian alvarez": "Խուլիան Ալվարես",
  "ferran torres": "Ֆերրան Տորրես", "dani olmo": "Դանի Օլմո",
  "pedri": "Պեդրի", "gavi": "Գավի", "rodrygo": "Ռոդրիգո",
  "federico valverde": "Ֆեդերիկո Վալվերդե", "aurelien tchouameni": "Օրելիեն Չուամենի",
  "thibaut courtois": "Տիբո Կուրտուա", "marc-andre ter stegen": "Մարկ-Անդրե տեր Ստեգեն",
  // Serie A
  "lautaro martinez": "Լաուտարո Մարտինես", "victor osimhen": "Վիկտոր Օսիմհեն",
  "dusan vlahovic": "Դուշան Վլահովիչ", "rafael leao": "Ռաֆաել Լեան",
  "khvicha kvaratskhelia": "Խվիչա Կվարացխելիա", "romelu lukaku": "Ռոմելու Լուկակու",
  "marcus thuram": "Մարկուս Թյուրամ", "paulo dybala": "Պաուլո Դիբալա",
  "nicolo barella": "Նիկոլո Բարելլա", "christian pulisic": "Քրիստիան Փուլիշիչ",
  "moise kean": "Մոիզ Կին", "mateo retegui": "Մատեո Ռետեգի",
  // Bundesliga
  "florian wirtz": "Ֆլորիան Վիրց", "jamal musiala": "Ջամալ Մուսիալա",
  "serge gnabry": "Սերժ Գնաբրի",
  "leroy sane": "Լերոյ Սանե", "michael olise": "Միքայել Օլիզե",
  "victor boniface": "Վիկտոր Բոնիֆաս", "patrik schick": "Պատրիկ Շիկ",
  "omar marmoush": "Օմար Մարմուշ", "loic bade": "Լոիկ Բադե",
  "joshua kimmich": "Յոշուա Կիմմիխ",
  // Ligue 1
  "ousmane dembele": "Ուսման Դեմբելե", "bradley barcola": "Բրեդլի Բարկոլա",
  "warren zaire-emery": "Ուորեն Զաիր-Էմերի", "mason greenwood": "Մեյսոն Գրինվուդ",
  "jonathan david": "Ջոնաթան Դեյվիդ", "alexandre lacazette": "Ալեքսանդր Լակազետ",
  "rayan cherki": "Ռայան Շերկի", "desire doue": "Դեզիրե Դուե",
  // Elsewhere and evergreen
  "lionel messi": "Լիոնել Մեսսի", "cristiano ronaldo": "Կրիշտիանու Ռոնալդու",
  "neymar": "Նեյմար", "karim benzema": "Կարիմ Բենզեմա",
  "sadio mane": "Սադիո Մանե", "riyad mahrez": "Ռիյադ Մահրեզ",
  "luis suarez": "Լուիս Սուարես", "sergio busquets": "Սերխիո Բուսկետս",

  // Added after measuring: only seven of the twenty names in the
  // top-scorer table were coming out in Armenian. These are the ones the
  // table was actually showing in Latin, plus the rest of each league's
  // regular scorers, so the table reads in one language rather than two.
  "joao pedro": "Ժոաո Պեդրու", "danny welbeck": "Դենի Ուելբեք",
  "jack hinshelwood": "Ջեք Հինշելվուդ", "cody gakpo": "Կոդի Գակպո",
  "josko gvardiol": "Յոշկո Գվարդիոլ", "morgan rogers": "Մորգան Ռոջերս",
  "keane lewis-potter": "Քին Լյուիս-Փոթեր", "wilson isidor": "Ուիլսոն Իսիդոր",
  "matheus cunha": "Մատեուս Կունյա", "eberechi eze": "Էբերեչի Էզե",
  "james maddison": "Ջեյմս Մեդիսոն",
  "hugo ekitike": "Հյուգո Էկիտիկե", "igor thiago": "Իգոր Թիագու",
  "richarlison": "Ռիշարլիսոն", "raul jimenez": "Ռաուլ Խիմենես",
  "jorgen strand larsen": "Յորգեն Ստրանդ Լարսեն", "beto": "Բետո",
  "kevin schade": "Քևին Շադե", "brennan johnson": "Բրենան Ջոնսոն",
  "antoine semenyo": "Անտուան Սեմենյո", "justin kluivert": "Ջասթին Կլյուիվերտ",
  "mikel oyarzabal": "Միկել Օյարսաբալ", "alexander sorloth": "Ալեքսանդեր Սյորլոթ",
  "ayoze perez": "Այոզե Պերես", "kike garcia": "Կիկե Գարսիա",
  "budimir": "Բուդիմիր", "ante budimir": "Անտե Բուդիմիր",
  "borja mayoral": "Բորխա Մայորալ", "samu aghehowa": "Սամու Աղեհովա",
  "vedat muriqi": "Վեդատ Մուրիկի", "sandro ramirez": "Սանդրո Ռամիրես",
  "gabriel jesus": "Գաբրիել Ժեզուս", "arda guler": "Արդա Գյուլեր",
  "nico williams": "Նիկո Ուիլյամս", "inaki williams": "Ինյակի Ուիլյամս",
  "mikel merino": "Միկել Մերինո", "martin zubimendi": "Մարտին Սուբիմենդի",
  "alvaro morata": "Ալվարո Մորատա", "iago aspas": "Յագո Ասպաս",
  // Serie A
  "ademola lookman": "Ադեմոլա Լուքման", "mattia zaccagni": "Մատտիա Զակկանյի",
  "gianluca scamacca": "Ջանլուկա Սկամակկա", "andrea belotti": "Անդրեա Բելոտտի",
  "domenico berardi": "Դոմենիկո Բերարդի",
  "santiago gimenez": "Սանտյագո Խիմենես", "artem dovbyk": "Արտեմ Դովբիկ",
  "riccardo orsolini": "Ռիկարդո Օրսոլինի", "lorenzo lucca": "Լորենցո Լուկկա",
  "federico chiesa": "Ֆեդերիկո Կիեզա", "nicolo zaniolo": "Նիկոլո Զանյոլո",
  // Bundesliga
  "serhou guirassy": "Սերու Գիրասսի", "deniz undav": "Դենիզ Ունդավ",
  "tim kleindienst": "Թիմ Կլայնդինստ", "ermedin demirovic": "Էրմեդին Դեմիրովիչ",
  "jonathan burkardt": "Ջոնաթան Բուրկարդտ", "maximilian beier": "Մաքսիմիլիան Բայեր",
  "nick woltemade": "Նիկ Վոլտեմադե", "karim adeyemi": "Քարիմ Ադեյեմի",
  // Ligue 1
  "arnaud kalimuendo": "Առնո Կալիմուենդո", "gaetan perrin": "Գաետան Պերրեն",
  "amine gouiri": "Ամին Գուիրի", "goncalo ramos": "Գոնսալու Ռամուշ",
  "achraf hakimi": "Աշրաֆ Հակիմի", "marquinhos": "Մարկինյոս",
  "vitinha": "Վիտինյա", "nuno mendes": "Նունու Մենդեշ",
  // Goalkeepers and defenders that come up often
  "alisson": "Ալիսոն", "ederson": "Էդերսոն", "gianluigi donnarumma": "Ջանլուիջի Դոննարումմա",
  "ruben dias": "Ռուբեն Դիաշ", "trent alexander-arnold": "Թրենթ Ալեքսանդր-Առնոլդ",
  "antonio rudiger": "Անտոնիո Ռյուդիգեր",
  "david raya": "Դեյվիդ Ռայա", "andre onana": "Անդրե Օնանա",

  // Added 6 September, after running a Premier League squad list through the
  // transliterator and reading what came out: Ջամես, Ջոնես, Վհիտե, Պոպե,
  // Կեանե, Ֆերնանդեզ. The rule spells a name letter by letter, and English
  // is the language that punishes that hardest - a silent final e, a w that
  // is a vowel, an "ea" that is not two sounds. None of that can be guessed
  // without knowing the language, and the roster does not say. So the men
  // who actually appear on these pages are spelled out.
  //
  // Spanish and Portuguese surnames in -ez end in ս, not զ, which the table
  // already did by hand for Խիմենես and Ալվարես and now does for the rest.
  "reece james": "Ռիս Ջեյմս", "sean longstaff": "Շոն Լոնգսթաֆ",
  "nick pope": "Նիկ Փոուփ", "michael keane": "Մայքլ Քին",
  "emile smith rowe": "Էմիլ Սմիթ Ռոու", "adam wharton": "Ադամ Ուորթոն",
  "james tarkowski": "Ջեյմս Տարկովսկի", "jarrad branthwaite": "Ջարադ Բրանթուեյթ",
  "ben white": "Բեն Ուայթ", "curtis jones": "Կերտիս Ջոնս",
  "andrew robertson": "Էնդրյու Ռոբերտսոն", "rico lewis": "Ռիկո Լյուիս",
  "dominic calvert-lewin": "Դոմինիկ Կալվերտ-Լյուին", "jacob murphy": "Ջեյքոբ Մերֆի",
  "dan burn": "Դեն Բըրն", "harvey elliott": "Հարվի Էլիոթ",
  "trevoh chalobah": "Տրեվո Չալոբա", "wesley fofana": "Ուեսլի Ֆոֆանա",
  "levi colwill": "Լևի Կոլուիլ", "marc guehi": "Մարկ Գեհի",
  "tyrick mitchell": "Թայրիկ Միչել", "jordan pickford": "Ջորդան Փիքֆորդ",
  "kobbie mainoo": "Քոբի Մեյնու", "anthony gordon": "Էնթոնի Գորդոն",
  "bruno guimaraes": "Բրունո Գիմարաես", "joelinton": "Ժոելինտոն",
  "micky van de ven": "Միկի վան դե Վեն", "destiny udogie": "Դեստինի Ուդոջի",
  "guglielmo vicario": "Գուլյելմո Վիկարիո", "yves bissouma": "Իվ Բիսումա",
  "pedro porro": "Պեդրո Պոռո", "cristian romero": "Կրիստիան Ռոմերո",
  "savinho": "Սավինյո", "ederson moraes": "Էդերսոն Մորայես",
  "nathan ake": "Նաթան Աքե", "jeremy doku": "Ժերեմի Դոկու",
  "bernardo silva": "Բերնարդո Սիլվա", "phil jones": "Ֆիլ Ջոնս",
  "jarell quansah": "Ջարել Քուանսա", "conor bradley": "Կոնոր Բրեդլի",
  "noni madueke": "Նոնի Մադուեկե", "christopher nkunku": "Քրիստոֆեր Նկունկու",
  "gabriel martinelli": "Գաբրիել Մարտինելի", "leandro trossard": "Լեանդրո Տրոսար",
  "oleksandr zinchenko": "Օլեքսանդր Զինչենկո", "kieran tierney": "Կիերան Տիրնի",
  "ibrahima konate": "Իբրահիմա Կոնատե", "wataru endo": "Վատարու Էնդո",
  "ryan gravenberch": "Ռայան Գրավենբերխ", "jeremie frimpong": "Ջերեմի Ֆրիմպոնգ",
  "rodrigo bentancur": "Ռոդրիգո Բենտանկուր", "pape matar sarr": "Պապ Մատար Սառ",
  "marcus rashford": "Մարկուս Ռաշֆորդ", "manuel akanji": "Մանուել Ականջի",
  "stefan ortega": "Շտեֆան Օրտեգա", "malo gusto": "Մալո Գյուստո",
  "axel disasi": "Աքսել Դիզասի", "takehiro tomiyasu": "Տակեհիրո Տոմիյասու",
  "jakub kiwior": "Յակուբ Կիվիոր", "sven botman": "Սվեն Բոտման",
  // The -ez surnames, and the men the table was renaming
  "emiliano martinez": "Էմիլիանո Մարտինես", "enzo fernandez": "Էնզո Ֆերնանդես",
  "robert sanchez": "Ռոբերտ Սանչես", "moises caicedo": "Մոիսես Կաիսեդո",
  "marc cucurella": "Մարկ Կուկուրելյա", "pedro neto": "Պեդրու Նետու",
  "gabriel magalhaes": "Գաբրիել Մագալյաես", "gabriel": "Գաբրիել",
  // Armenians
  "henrikh mkhitaryan": "Հենրիխ Մխիթարյան", "eduard spertsyan": "Էդուարդ Սպերցյան",
  "grant-leon ranos": "Գրանտ-Լեոն Ռանոս", "tigran barseghyan": "Տիգրան Բարսեղյան",
  "vahan bichakhchyan": "Վահան Բիչախչյան", "nair tiknizyan": "Նաիր Տիկնիզյան",
  "edgar sevikyan": "Էդգար Սևիկյան", "lucas zelarayan": "Լուկաս Զելարայան",
};

function lookupKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function armenianPlayerName(name: string | null | undefined): string {
  if (!name) return "";
  const key = lookupKey(name);
  const hit = playerNames[key];
  if (hit) return hit;

  // API-Football often abbreviates a first name ("B. Fernandes", "E.
  // Haaland"). Match on the surname when it is unambiguous, so the table
  // and the articles agree on the spelling.
  //
  // ONLY when the first name really is abbreviated, and only when its
  // initial matches. This ran on full names too, and the table holds one
  // Martinez - Lautaro. So Emiliano Martinez, Aston Villa's goalkeeper,
  // came out of it as "Լաուտարո Մարտինես": not an awkward spelling but a
  // different footballer, printed as fact on a squad page. Every surname
  // the table carries exactly once did the same to every other man who
  // shares it.
  //
  // A name that gets this far with its own first name spelled out is not a
  // name the table knows. It goes to the transliterator, which may spell it
  // roughly but will not turn him into somebody else.
  const parts = key.split(" ");
  const initial = /^([a-z])\.?$/.exec(parts[0] ?? "");
  if (initial && parts.length > 1) {
    const surname = parts[parts.length - 1];
    if (surname.length > 3) {
      const matches = Object.entries(playerNames).filter(([full]) => {
        const other = full.split(" ");
        return other[other.length - 1] === surname && other[0]?.[0] === initial[1];
      });
      if (matches.length === 1) return matches[0][1];
    }
  }

  return transliterateName(name) ?? name;
}
