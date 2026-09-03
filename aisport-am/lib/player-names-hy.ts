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
  "virgil van dijk": "Վիրխիլ վան Դեյք", "william saliba": "Ուիլյամ Սալիբա",
  "kai havertz": "Կայ Հավերց", "darwin nunez": "Դարվին Նունյես",
  "dominik szoboszlai": "Դոմինիկ Սոբոսլաի", "nicolas jackson": "Նիկոլա Ժակսոն",
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
  const surname = key.split(" ").pop() ?? "";
  if (surname.length > 3) {
    const matches = Object.entries(playerNames).filter(([full]) => full.split(" ").pop() === surname);
    if (matches.length === 1) return matches[0][1];
  }

  return transliterateName(name) ?? name;
}
