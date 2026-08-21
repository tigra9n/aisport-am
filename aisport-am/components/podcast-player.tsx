"use client";

import { useState } from "react";

export type PodcastEpisode = { id: string; date: string; title: string; summary: string; duration: string };

export function PodcastPlayer({ episodes }: { episodes: PodcastEpisode[] }) {
  const [activeId, setActiveId] = useState(episodes[0]?.id ?? "");
  const [notice, setNotice] = useState("");
  const active = episodes.find((episode) => episode.id === activeId) ?? episodes[0];
  if (!active) return null;

  return <div className="podcast-layout">
    <section className="podcast-stage">
      <div className="podcast-visual"><span className="podcast-wave">▮▯▮▮▯▮▯▮</span><button type="button" aria-label="Բացել փոդքաստը" onClick={() => setNotice("Այս թողարկման աուդիո ֆայլը դեռ չի կցվել։")}>▶</button><small>10 րոպե</small></div>
      <div className="podcast-copy"><span>{active.date}</span><h2>{active.title}</h2><p>{active.summary}</p>{notice ? <p className="podcast-notice" role="status">{notice}</p> : null}<div><b>{active.duration}</b><i>Ամեն օր՝ օրվա գլխավոր թեման</i></div></div>
    </section>
    <aside className="podcast-playlist"><header><span>Ամենօրյա թողարկումներ</span><h2>Փոդքաստների ցանկ</h2></header>{episodes.map((episode) => <button className={episode.id === active.id ? "active" : ""} type="button" onClick={() => { setActiveId(episode.id); setNotice(""); }} key={episode.id}><span>{episode.date}</span><strong>{episode.title}</strong><small>{episode.duration}</small></button>)}</aside>
  </div>;
}
