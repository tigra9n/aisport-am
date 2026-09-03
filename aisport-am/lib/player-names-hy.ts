// Player names in Armenian.
//
// The top-scorer table printed "Haaland", "Saka", "Bruno Fernandes" in
// Latin on a page that is Armenian everywhere else, including in the
// articles about those same players.
//
// This is a table and not a transliterator on purpose. The site already
// transliterates unknown club names, and that machinery once put a wrong,
// Latin-looking name into a published headline. A name is somebody's name:
// getting "Հալանդ" from "Haaland" by rule also produces "Հաալանդ", and
// there is no way for the code to know which is right. So known names are
// spelled out here, and a name that is not here is left exactly as the API
// sent it - recognisable, if not Armenian - rather than guessed at.
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
  "harry kane bayern": "Հարրի Քեյն", "serge gnabry": "Սերժ Գնաբրի",
  "leroy sane": "Լերոյ Սանե", "michael olise": "Միքայել Օլիզե",
  "victor boniface": "Վիկտոր Բոնիֆաս", "patrik schick": "Պատրիկ Շիկ",
  "omar marmoush": "Օմար Մարմուշ", "loic bade": "Լոիկ Բադե",
  "joshua kimmich": "Յոշուա Կիմմիխ", "jamal musiala bayern": "Ջամալ Մուսիալա",
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
  return name;
}
