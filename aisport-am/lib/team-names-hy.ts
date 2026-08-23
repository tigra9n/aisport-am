const teamNames: Record<string, string> = {
  // Armenia
  "ararat-armenia": "Արարատ-Արմենիա", ararat: "Արարատ", alashkert: "Ալաշկերտ",
  bkma: "ԲԿՄԱ", gandzasar: "Գանձասար", noah: "Նոա", pyunik: "Փյունիկ",
  shirak: "Շիրակ", syunik: "Սյունիք", urartu: "Ուրարտու", van: "Վան",
  "west armenia": "Վեստ Արմենիա",

  // England
  arsenal: "Արսենալ", "aston villa": "Աստոն Վիլա", bournemouth: "Բորնմութ",
  brentford: "Բրենթֆորդ", brighton: "Բրայթոն", burnley: "Բարնլի", chelsea: "Չելսի",
  "crystal palace": "Քրիսթալ Փելաս", everton: "Էվերթոն", fulham: "Ֆուլհեմ",
  "hull city": "Հալ Սիթի", leeds: "Լիդս", liverpool: "Լիվերպուլ", "manchester city": "Մանչեսթեր Սիթի",
  "manchester united": "Մանչեսթեր Յունայթեդ", newcastle: "Նյուքասլ",
  "nottingham forest": "Նոթինգհեմ Ֆորեսթ", sunderland: "Սանդերլենդ",
  tottenham: "Տոտենհեմ", "west ham": "Վեսթ Հեմ", wolves: "Վուլվերհեմփթոն",
  wolverhampton: "Վուլվերհեմփթոն",

  // Spain
  alaves: "Ալավես", "athletic club": "Աթլետիկ Բիլբաո", "atletico madrid": "Ատլետիկո Մադրիդ",
  barcelona: "Բարսելոնա", "celta vigo": "Սելտա", elche: "Էլչե", espanyol: "Էսպանյոլ",
  getafe: "Խետաֆե", girona: "Ժիրոնա", levante: "Լևանտե", mallorca: "Մալյորկա",
  osasuna: "Օսասունա", "rayo vallecano": "Ռայո Վալեկանո", "real betis": "Բետիս",
  "real madrid": "Ռեալ Մադրիդ", "real oviedo": "Օվիեդո", "real sociedad": "Ռեալ Սոսիեդադ",
  sevilla: "Սևիլյա", valencia: "Վալենսիա", villarreal: "Վիլյառեալ",

  // Italy
  atalanta: "Ատալանտա", bologna: "Բոլոնիա", cagliari: "Կալյարի", como: "Կոմո",
  cremonese: "Կրեմոնեզե", fiorentina: "Ֆիորենտինա", genoa: "Ջենոա", inter: "Ինտեր",
  juventus: "Յուվենտուս", lazio: "Լացիո", lecce: "Լեչչե", milan: "Միլան",
  "ac milan": "Միլան", napoli: "Նապոլի", parma: "Պարմա", pisa: "Պիզա",
  roma: "Ռոմա", "as roma": "Ռոմա", sassuolo: "Սասուոլո", torino: "Տորինո",
  udinese: "Ուդինեզե", verona: "Վերոնա",

  // Germany
  augsburg: "Աուգսբուրգ", "bayer leverkusen": "Բայեր", "bayern munich": "Բավարիա",
  "bayern munchen": "Բավարիա", "borussia dortmund": "Բորուսիա Դորտմունդ",
  "borussia monchengladbach": "Բորուսիա Մյոնխենգլադբախ", "eintracht frankfurt": "Այնտրախտ",
  freiburg: "Ֆրայբուրգ", "sc freiburg": "Ֆրայբուրգ", "hamburger sv": "Համբուրգ",
  heidenheim: "Հայդենհայմ", hoffenheim: "Հոֆենհայմ", koln: "Քյոլն", mainz: "Մայնց",
  "rb leipzig": "Լայպցիգ", "st pauli": "Սանկտ Պաուլի", "st. pauli": "Սանկտ Պաուլի",
  stuttgart: "Շտուտգարտ", "vfb stuttgart": "Շտուտգարտ", "union berlin": "Ունիոն Բեռլին",
  "werder bremen": "Վերդեր", wolfsburg: "Վոլֆսբուրգ",

  // France
  angers: "Անժե", auxerre: "Օսեր", brest: "Բրեստ", "le havre": "Լը Հավր",
  lens: "Լանս", lille: "Լիլ", lorient: "Լորյան", lyon: "Լիոն", marseille: "Մարսել",
  metz: "Մեց", monaco: "Մոնակո", nantes: "Նանտ", nice: "Նիցցա", "paris fc": "Փարիզ ՖԿ",
  "paris saint germain": "ՊՍԺ", psg: "ՊՍԺ", rennes: "Ռեն", strasbourg: "Ստրասբուրգ",
  toulouse: "Թուլուզ",

  // Clubs appearing in European competitions
  aarhus: "Օրհուս", ajax: "Այաքս", anderlecht: "Անդերլեխտ", "austria vienna": "Աուստրիա Վիեննա",
  benfica: "Բենֆիկա", besiktas: "Բեշիքթաշ", "borac banja luka": "Բորաց Բանյա Լուկա",
  brann: "Բրան", "cska sofia": "ԲԿՄԱ Սոֆիա", "dinamo tirana": "Դինամո Տիրանա",
  drita: "Դրիտա", "egnatia rrogozhine": "Էգնատիա Ռոգոժինե", "fc copenhagen": "Կոպենհագեն",
  "fc iberia 1999": "Իբերիա 1999", "fc lugano": "Լուգանո", "fc midtjylland": "Միդտյուլանդ",
  "fc nordsjaelland": "Նորդշելանդ", "fc st gallen": "Սանկտ Գալեն", "fc st. gallen": "Սանկտ Գալեն",
  "fc sion": "Սիոն", "fc thun": "Թուն", "fk crvena zvezda": "Ցրվենա Զվեզդա",
  "fk jablonec": "Յաբլոնեց", "fk partizan": "Պարտիզան", "ferencvarosi tc": "Ֆերենցվարոշ",
  gent: "Գենտ", "gornik zabrze": "Գուռնիկ Զաբժե", "hnk hajduk split": "Հայդուկ Սպլիտ",
  "hnk rijeka": "Ռիեկա", "hapoel tel aviv": "Հապոել Թել Ավիվ",
  "heart of midlothian": "Հարթս", hibernian: "Հիբերնիան", "hradec kralove": "Հրադեց Կրալովե",
  "inter club d'escaldes": "Ինտեր Էսկալդես", "inter turku": "Ինտեր Տուրկու",
  jagiellonia: "Յագելոնիա", "ki klaksvik": "ԿԻ Կլակսվիկ", "kairat almaty": "Կայրաթ Ալմաթի",
  "kauno zalgiris": "Կաունաս Ժալգիրիս", kups: "ԿուՊՍ", larne: "Լարն", "lech poznan": "Լեխ Պոզնան",
  lillestrom: "Լիլեստրոմ", "lincoln red imps fc": "Լինքոլն Ռեդ Իմփս",
  "maccabi tel aviv": "Մաքքաբի Թել Ավիվ", "mjallby aif": "Մյելբյու", motherwell: "Մադերվել",
  ofi: "ՕՖԻ", "omonia nicosia": "Օմոնիա Նիկոսիա", paok: "ՊԱՕԿ", pafos: "Պաֆոս",
  panathinaikos: "Պանատինաիկոս", plzen: "Վիկտորիա Պլզեն", qarabag: "Ղարաբաղ",
  "rakow czestochowa": "Ռակուվ Չեստոխովա", rangers: "Ռեյնջերս", "rapid vienna": "Ռապիդ Վիեննա",
  "red bull salzburg": "Ռեդ Բուլ Զալցբուրգ", riga: "Ռիգա", "sc braga": "Բրագա",
  "shamrock rovers": "Շեմրոկ Ռովերս", "st truiden": "Սենտ Տրյուդեն", "st. truiden": "Սենտ Տրյուդեն",
  trabzonspor: "Տրաբզոնսպոր", tromso: "Տրոմսյո", twente: "Տվենտե",
  "universitatea craiova": "Ունիվերսիտատյա Կրայովա", "vikingur reykjavik": "Վիկինգուր Ռեյկյավիկ",
};

// 2026/27 UEFA Champions League, Europa League and Conference League.
// The list also includes qualifying-round clubs, so names are ready before match day.
Object.assign(teamNames, {
  // Champions League
  "aek athens": "ԱԵԿ Աթենք", "arsenal": "Արսենալ", "aston villa": "Աստոն Վիլա",
  "atert bissen": "Ատերտ Բիսեն", "atletico madrid": "Ատլետիկո Մադրիդ",
  "bayern munich": "Բավարիա", "bodoe/glimt": "Բուդյո-Գլիմտ", "bodo/glimt": "Բուդյո-Գլիմտ",
  "borussia dortmund": "Բորուսիա Դորտմունդ", "borac banja luka": "Բորաց Բանյա Լուկա",
  "celje": "Ցելյե", "celtic": "Սելթիկ", "club brugge": "Բրյուգե", "como": "Կոմո",
  "crvena zvezda": "Ցրվենա Զվեզդա", "dinamo zagreb": "Դինամո Զագրեբ",
  "dynamo zagreb": "Դինամո Զագրեբ", "fenerbahce": "Ֆեներբահչե", "feyenoord": "Ֆեյենորդ",
  "flora tallinn": "Ֆլորա Տալլին", "floriana": "Ֆլորիանա", "galatasaray": "Գալաթասարայ",
  "gyori eto": "Դյորի ԷՏՕ", "hapoel beer sheva": "Հապոել Բեեր Շևա",
  "hapoel beer-sheva": "Հապոել Բեեր Շևա", "iberia tbilisi": "Իբերիա Թբիլիսի",
  "lask linz": "ԼԱՍԿ", "lens": "Լանս", "levski sofia": "Լևսկի Սոֆիա", "lille": "Լիլ",
  "liverpool": "Լիվերպուլ", "lyon": "Լիոն", "manchester city": "Մանչեսթեր Սիթի",
  "manchester united": "Մանչեսթեր Յունայթեդ", "ml vitebsk": "ՄԼ Վիտեբսկ",
  "vitebsk": "Վիտեբսկ", "napoli": "Նապոլի", "nec nijmegen": "ՆԵԿ Նեյմեգեն",
  "n.e.c.": "ՆԵԿ Նեյմեգեն", "olympiacos": "Օլիմպիակոս", "olympiakos": "Օլիմպիակոս",
  "paris saint germain": "ՊՍԺ", "petrocub": "Պետրոկուբ", "porto": "Պորտու",
  "psv eindhoven": "ՊՍՎ", "real betis": "Բետիս", "real madrid": "Ռեալ Մադրիդ",
  "sabah": "Սաբահ", "shakhtar donetsk": "Շախտյոր Դոնեցկ", "slavia prague": "Սլավիա Պրահա",
  "slavia praha": "Սլավիա Պրահա", "slovan bratislava": "Սլովան Բրատիսլավա",
  "sparta prague": "Սպարտա Պրահա", "sparta praha": "Սպարտա Պրահա",
  "sporting lisbon": "Սպորտինգ", "sporting cp": "Սպորտինգ", "sturm graz": "Շտուրմ Գրաց",
  "sutjeska": "Սուտյեսկա", "the new saints": "Նյու Սեյնթս", "tre fiori": "Տրե Ֆիորի",
  "union saint-gilloise": "Յունիոն Սեն-Ժիլուազ", "union st. gilloise": "Յունիոն Սեն-Ժիլուազ",
  "union sg": "Յունիոն Սեն-Ժիլուազ", "vardar": "Վարդար", "viking": "Վիկինգ",

  // Europa League
  "aluminij": "Ալումինիյ", "az alkmaar": "ԱԶ Ալկմար", "bayer leverkusen": "Բայեր",
  "celta vigo": "Սելտա", "crystal palace": "Քրիսթալ Փելաս", "derry city": "Դերի Սիթի",
  "dynamo kyiv": "Դինամո Կիև", "dynamo kiev": "Դինամո Կիև", "hammarby": "Համարբյու",
  "hoffenheim": "Հոֆենհայմ", "karvina": "Կարվինա", "marseille": "Մարսել",
  "olympique marseille": "Մարսել", "real sociedad": "Ռեալ Սոսիեդադ", "rennes": "Ռեն",
  "sheriff tiraspol": "Շերիֆ", "sint-truiden": "Սենտ Տրյուդեն", "st truiden": "Սենտ Տրյուդեն",
  "sunderland": "Սանդերլենդ", "torreense": "Տորենսե", "universitatea cluj": "Ունիվերսիտատյա Կլուժ",
  "u cluj": "Ունիվերսիտատյա Կլուժ", "vojvodina": "Վոյվոդինա", "vestri": "Վեստրի",
  "viktoria plzen": "Վիկտորիա Պլզեն", "zilina": "Ժիլինա",

  // Conference League — play-offs and qualifying rounds
  "aek larnaca": "ԱԵԿ Լառնակա", "ajax": "Այաքս", "apollon limassol": "Ապոլոն Լիմասոլ",
  "apollon": "Ապոլոն", "astana": "Աստանա", "atletic escaldes": "Ատլետիկ Էսկալդես",
  "atletico escaldes": "Ատլետիկ Էսկալդես", "auda": "Աուդա", "austria vienna": "Աուստրիա Վիեննա",
  "ballkani": "Բալկանի", "basaksehir": "Բաշաքշեհիր", "istanbul basaksehir": "Բաշաքշեհիր",
  "bate borisov": "ԲԱՏԷ", "beitar jerusalem": "Բեյթար Երուսաղեմ", "beitar": "Բեյթար",
  "bohemians 1905": "Բոհեմիանս", "bohemians": "Բոհեմիանս", "bravo": "Բրավո",
  "caernarfon town": "Քերնարվոն Թաուն", "cfr 1907 cluj": "ՉՖՌ Կլուժ", "cfr cluj": "ՉՖՌ Կլուժ",
  "coleraine": "Քոլրեյն", "connah's quay": "Քոնաս Քուեյ", "connahs quay": "Քոնաս Քուեյ",
  "cska 1948": "ԲԿՄԱ 1948", "dac 1904": "ԴԱՑ 1904", "debrecen": "Դեբրեցեն",
  "decic": "Դեչիչ", "dila gori": "Դիլա Գորի", "differdange 03": "Դիֆերդանժ",
  "dinamo city": "Դինամո Սիթի", "dinamo minsk": "Դինամո Մինսկ", "dinamo tbilisi": "Դինամո Թբիլիսի",
  "dukagjini": "Դուկաջինի", "elbasani": "Էլբասանի", "elimay": "Էլիմայ", "elimai": "Էլիմայ",
  "europa fc": "Եվրոպա", "fc santa coloma": "Սանտա Կոլոմա", "fcsb": "ՖԿՍԲ",
  "gais": "ԳԱԻՍ", "gks katowice": "Կատովիցե", "katowice": "Կատովիցե",
  "glentoran": "Գլենտորան", "hamrun spartans": "Համրուն Սպարտանս", "hb torshavn": "ՀԲ Տորսհավն",
  "h. boltfelag": "ՀԲ Տորսհավն", "hegelmann": "Հեգելման", "hjk helsinki": "ՀԺԿ Հելսինկի",
  "hjk": "ՀԺԿ", "ifk goteborg": "Գյոթեբորգ", "ilves": "Իլվես", "kalju": "Կալյու",
  "nomme kalju": "Նյոմե Կալյու", "koper": "Կոպեր", "la fiorita": "Լա Ֆիորիտա",
  "levadia tallinn": "Լևադիա Տալլին", "liepaja": "Լիեպայա", "linfield": "Լինֆիլդ",
  "lnz cherkasy": "ԼՆԶ Չերկասի", "ludogorets": "Լուդոգորեց", "malisheva": "Մալիշևա",
  "marsaxlokk": "Մարսաշլոկ", "milsami orhei": "Միլսամի", "milsami": "Միլսամի",
  "mondorf-les-bains": "Մոնդորֆ", "mondorf": "Մոնդորֆ", "mornar": "Մորնար",
  "neftchi baku": "Նեֆթչի", "nordsjaelland": "Նորդշելանդ", "paks": "Պակշ", "paksi": "Պակշ",
  "paide linnameeskond": "Պայդե", "paide": "Պայդե", "panevezys": "Պանևեժիս",
  "penybont": "Պենիբոնտ", "petrovac": "Պետրովաց", "polissya zhytomyr": "Պոլիսյա Ժիտոմիր",
  "polissya": "Պոլիսյա", "rfs": "ՌՖՍ", "runavik": "Ռունավիկ", "nsi runavik": "Ռունավիկ",
  "sarajevo": "Սարաևո", "shelbourne": "Շելբուրն", "shkendija": "Շկենդիա", "sileks": "Սիլեքս",
  "spartak trnava": "Սպարտակ Տրնավա", "st joseph's": "Սենտ Ջոզեֆս", "st josephs": "Սենտ Ջոզեֆս",
  "stjarnan": "Ստյառնան", "tobol kostanay": "Տոբոլ", "tobol": "Տոբոլ",
  "torpedo kutaisi": "Տորպեդո Քութայիսի", "una strassen": "Յունա Շտրասեն", "vaduz": "Վադուց",
  "valletta": "Վալետա", "valur reykjavik": "Վալյուր", "valur": "Վալյուր", "varazdin": "Վարաժդին",
  "velez mostar": "Վելեժ Մոստար", "velez": "Վելեժ", "vikingur gota": "Վիկինգուր Գոտա",
  "virtus": "Վիրտուս", "vllaznia shkoder": "Վլազնիա", "vllaznia": "Վլազնիա",
  "zelezničar pancevo": "Ժելեզնիչար Պանչևո", "zeleznicar pancevo": "Ժելեզնիչար Պանչևո",
  "zalgiris vilnius": "Ժալգիրիս Վիլնյուս", "zalgiris": "Ժալգիրիս", "zimbru chisinau": "Զիմբրու",
  "zimbru": "Զիմբրու", "zire": "Զիրա", "zira": "Զիրա", "zrinjski": "Զրինսկի Մոստար", "zrinjski mostar": "Զրինսկի Մոստար",
});

// 2026/27 promoted clubs across the top-5 leagues.
Object.assign(teamNames, {
  // England — promoted to the Premier League
  "coventry": "Քովենթրի", "coventry city": "Քովենթրի Սիթի",
  "ipswich": "Իփսվիչ", "ipswich town": "Իփսվիչ Թաուն",

  // Spain — promoted to La Liga
  "racing santander": "Ռասինգ Սանտանդեր", "racing de santander": "Ռասինգ Սանտանդեր",
  "deportivo la coruna": "Դեպորտիվո Լա Կորունյա", "deportivo": "Դեպորտիվո",
  "malaga": "Մալագա",

  // Italy — promoted to Serie A
  "venezia": "Վենեցիա", "frosinone": "Ֆրոզինոնե", "monza": "Մոնցա",

  // Germany — promoted to the Bundesliga
  "schalke": "Շալկե", "schalke 04": "Շալկե 04",
  "elversberg": "Էլվերսբերգ", "sv elversberg": "Էլվերսբերգ",
  "paderborn": "Պադերբորն", "sc paderborn": "Պադերբորն", "paderborn 07": "Պադերբորն 07",

  // France — promoted to Ligue 1
  "troyes": "Տրուա", "le mans": "Լը Ման",
});

function lookupKey(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[øØ]/g, "o")
    .replace(/[łŁ]/g, "l")
    .replace(/[đĐðÐ]/g, "d")
    .replace(/[þÞ]/g, "th")
    .replace(/[æÆ]/g, "ae")
    .replace(/[œŒ]/g, "oe")
    .replace(/ß/g, "ss")
    .replace(/[’‘`]/g, "'")
    .replace(/\b(f\.c\.|fc|f\.k\.|fk)\b/gi, (value) => value.toLowerCase())
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const pairs: Array<[string, string]> = [
  ["sch", "շ"], ["sh", "շ"], ["ch", "չ"], ["zh", "ժ"], ["kh", "խ"],
  ["ph", "ֆ"], ["th", "թ"], ["ts", "ց"], ["dz", "ձ"], ["ck", "կ"],
  ["qu", "քվ"], ["ou", "ու"], ["oo", "ու"], ["ee", "ի"],
];
const letters: Record<string, string> = {
  a: "ա", b: "բ", c: "կ", d: "դ", e: "ե", f: "ֆ", g: "գ", h: "հ", i: "ի",
  j: "ջ", k: "կ", l: "լ", m: "մ", n: "ն", o: "ո", p: "պ", q: "ք", r: "ր",
  s: "ս", t: "տ", u: "ու", v: "վ", w: "վ", x: "քս", y: "յ", z: "զ",
};

function transliterate(name: string) {
  const plain = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  let result = "";
  for (let index = 0; index < plain.length;) {
    const remaining = plain.slice(index).toLowerCase();
    const pair = pairs.find(([latin]) => remaining.startsWith(latin));
    if (pair) {
      result += pair[1];
      index += pair[0].length;
      continue;
    }
    const character = plain[index];
    result += letters[character.toLowerCase()] ?? character;
    index += 1;
  }
  return result
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) => (word ? word[0].toLocaleUpperCase("hy-AM") + word.slice(1) : word))
    .join(" ");
}

// Club affixes that carry no identifying information (FC Barcelona == Barcelona).
// Ordered longest-first so that e.g. "SSC" is preferred over "SS".
const CLUB_PREFIX = /^(?:\d+\s*\.?\s*)?(?:a\.e\.k\.|f\.c\.|f\.k\.|spvgg|stade|cska|aek|afc|acf|asd|bsc|fbc|fsv|gnk|hnk|ifk|kaa|msv|ogc|rcd|rsc|ssc|ssd|tsg|tsv|vfb|vfl|vfr|ac|as|bk|ca|cd|cf|cs|fc|ff|fk|if|kv|nk|rc|sc|sd|sk|ss|sv|ud|us)\s+/i;
const CLUB_SUFFIX = /\s+(?:afc|acf|ac|bk|cf|fc|ff|fk|if|sc|sk|sv)$/i;
const LEADING_NUMBER = /^\d+\s*\.?\s+/;
const TRAILING_YEAR = /\s+\d{2,4}$/;

export function armenianTeamName(name: string) {
  const key = lookupKey(name);

  // Try the raw key first, then progressively stripped variants, so that
  // "1. FC Heidenheim", "FC Heidenheim" and "Heidenheim" all resolve.
  const variants = new Set<string>([key]);
  let stripped = key;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = stripped.replace(LEADING_NUMBER, "").replace(CLUB_PREFIX, "").replace(CLUB_SUFFIX, "").trim();
    if (next === stripped || !next) break;
    stripped = next;
    variants.add(next);
  }

  for (const variant of variants) {
    const hit = teamNames[variant];
    if (hit) return hit;
  }

  // Last resort before transliterating: drop a trailing founding year
  // ("Mainz 05" -> "Mainz"). Tried last so "Schalke 04" keeps its own entry.
  for (const variant of variants) {
    const withoutYear = variant.replace(TRAILING_YEAR, "").trim();
    if (withoutYear && withoutYear !== variant && teamNames[withoutYear]) return teamNames[withoutYear];
  }

  return transliterate(name);
}
