"use client";

import { useEffect, useState } from "react";

type Comment = {
  id: number;
  author: string;
  body: string;
  createdAt: string;
};

export function CommentList({ articleSlug, refreshKey }: { articleSlug: string; refreshKey?: number }) {
  const [comments, setComments] = useState<Comment[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/comments?articleSlug=${encodeURIComponent(articleSlug)}`)
      .then((res) => res.ok ? res.json() as Promise<{ comments: Comment[] }> : { comments: [] })
      .then((data) => { if (!cancelled) setComments(data.comments); })
      .catch(() => { if (!cancelled) setComments([]); });
    return () => { cancelled = true; };
  }, [articleSlug, refreshKey]);

  if (comments === null) return null;
  if (comments.length === 0) return <p className="comments-empty">Առաջինը գրիր մեկնաբանություն։</p>;

  return (
    <ul className="comment-list">
      {comments.map((c) => (
        <li key={c.id} className="comment-item">
          <div className="comment-item-head">
            <strong>{c.author}</strong>
            <time>{new Date(c.createdAt + "Z").toLocaleString("hy-AM", { timeZone: "Asia/Yerevan", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
          </div>
          <p>{c.body}</p>
        </li>
      ))}
    </ul>
  );
}
