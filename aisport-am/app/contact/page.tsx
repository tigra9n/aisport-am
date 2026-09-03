import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";
import { CONTACT_EMAIL, FOUNDER_NAME } from "../../lib/site-info";
import { activeProfiles } from "../../lib/social";

export const metadata: Metadata = {
  alternates: { canonical: "https://aifootball.am/contact" },
  title: "Կապ մեզ հետ — AIFootball.am",
  description:
    "Կապվեք AIFootball.am-ի խմբագրության հետ՝ նյութի սխալի մասին հայտնելու, համագործակցության կամ գովազդի հարցերով։",
};

export default function ContactPage() {
  const profiles = activeProfiles();
  const mailto = (subject: string) => `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`;

  return <main><SiteHeader /><div className="site-shell inner-page" style={{ maxWidth: 780 }}>
    <span className="page-kicker">Կապ</span>
    <h1 className="page-title">Կապ մեզ հետ</h1>
    <div className="legal-content">
      <p>Գրեք մեզ ցանկացած հարցով։ Նամակները կարդում է կայքի խմբագիրը՝ {FOUNDER_NAME}, և պատասխանում է սովորաբար 1–2 աշխատանքային օրվա ընթացքում։</p>

      <h2>Էլեկտրոնային փոստ</h2>
      <p style={{ fontSize: 18 }}><a href={`mailto:${CONTACT_EMAIL}`}><strong>{CONTACT_EMAIL}</strong></a></p>

      <h2>Նյութում սխալ եք նկատե՞լ</h2>
      <p>Սա մեզ համար ամենակարևոր նամակն է։ Գրեք՝ <a href={mailto("Սխալ նյութում")}>{CONTACT_EMAIL}</a>, թեմայի տողում՝ «Սխալ նյութում», և նշեք․</p>
      <ul>
        <li>նյութի հղումը,</li>
        <li>ինչը սխալ է (կոնկրետ նախադասությունը կամ թիվը),</li>
        <li>ինչ է ճիշտը, և հնարավորության դեպքում՝ աղբյուրը։</li>
      </ul>
      <p>Հաստատված սխալը ուղղում ենք նույն օրը։ Եթե սխալը հիմնարար է՝ նյութը հանվում է կայքից։ Ինչպես ենք աշխատում՝ նկարագրված է <Link href="/about">«Մեր մասին»</Link> էջում։</p>

      <h2>Համագործակցություն և գովազդ</h2>
      <p>Գովազդի, բովանդակության համագործակցության կամ կայքի տվյալների օգտագործման հարցերով՝ <a href={mailto("Համագործակցություն")}>{CONTACT_EMAIL}</a>, թեմայի տողում՝ «Համագործակցություն»։</p>

      <h2>Հեղինակային իրավունք</h2>
      <p>Եթե կարծում եք, որ կայքում օգտագործվել է ձեր պատկերը կամ տեքստը առանց թույլտվության, գրեք՝ <a href={mailto("Հեղինակային իրավունք")}>{CONTACT_EMAIL}</a>։ Նշեք նյութի հղումը և ձեր իրավունքը հաստատող տվյալները — կստուգենք և կհեռացնենք, եթե պահանջը հիմնավոր է։</p>

      {profiles.length > 0 && <>
        <h2>Սոցիալական ցանցեր</h2>
        <p>{profiles.map((profile, index) => <span key={profile.key}>
          {index > 0 ? " · " : ""}
          <a href={profile.url} target="_blank" rel="noopener noreferrer">{profile.label}</a>
        </span>)}</p>
      </>}
    </div>
  </div><SiteFooter /></main>;
}
