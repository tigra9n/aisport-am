import { PodcastPlayer, type PodcastEpisode } from "../../components/podcast-player";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";

const episodes: PodcastEpisode[] = [
  { id: "today", date: "Այսօր · 21 օգոստոսի", title: "Օրվա խաղերը և ամենակարևոր մարզական թեմաները", summary: "AIFootball-ի 10-րոպեանոց արագ ամփոփումը՝ գլխավոր լուրը, կարևոր թվերն ու առաջիկա խաղերը մեկ թողարկման մեջ։", duration: "10:00" },
  { id: "aug-20", date: "20 օգոստոսի", title: "Եվրոպական գավաթների երեկոն՝ մեկ փոդքաստում", summary: "Գլխավոր արդյունքները, շրջադարձային պահերը և հայկական ակումբների ելույթները։", duration: "09:42" },
  { id: "aug-19", date: "19 օգոստոսի", title: "Տրանսֆերային շուկայի օրվա պատմությունը", summary: "Օրվա կարևոր գործարքներն ու սպասվող տեղափոխությունները՝ առանց ավելորդ աղմուկի։", duration: "10:16" },
  { id: "aug-18", date: "18 օգոստոսի", title: "Հայկական սպորտի շաբաթվա գլխավոր մեկնարկները", summary: "Հայ մարզիկների առաջիկա մրցելույթներն ու այն ամենը, ինչ պետք է իմանալ։", duration: "09:55" },
  { id: "aug-17", date: "17 օգոստոսի", title: "Մրցաշարային շաբաթվա գլխավոր թվերը", summary: "Թոփ առաջնությունների կարևոր վիճակագրությունն ու շաբաթվա շրջադարձային դրվագները։", duration: "10:08" },
  { id: "aug-16", date: "16 օգոստոսի", title: "Հայ մարզիկների միջազգային ելույթները", summary: "Մեր մարզիկների արդյունքներն ու առաջիկա մրցելույթները՝ մեկ ամփոփ թողարկմամբ։", duration: "09:58" },
  { id: "aug-15", date: "15 օգոստոսի", title: "Շաբաթվա գլխավոր պատմությունները", summary: "Ֆուտբոլից մինչև անհատական մարզաձևեր՝ ամենակարևոր թեմաները 10 րոպեում։", duration: "10:11" },
];

export default function PodcastsPage() {
  return <main><SiteHeader /><div className="site-shell inner-page podcast-page"><span className="page-kicker">AIFootball ձայնային</span><h1 className="page-title">Փոդքաստներ</h1><p className="page-intro">Ամեն օր՝ 10 րոպեում օրվա գլխավոր մարզական թեմաները, արդյունքներն ու պատմությունները։</p><PodcastPlayer episodes={episodes} /></div><SiteFooter /></main>;
}
