import { sql } from "drizzle-orm";
import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const sources = sqliteTable("sources", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  feedUrl: text("feed_url").notNull(),
  language: text("language").notNull().default("en"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("sources_feed_url_unique").on(table.feedUrl)]);

export const articles = sqliteTable("articles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  excerpt: text("excerpt").notNull(),
  content: text("content").notNull(),
  category: text("category").notNull(),
  imageUrl: text("image_url"),
  sourceName: text("source_name").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourcePublishedAt: text("source_published_at"),
  publishedAt: text("published_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  status: text("status").notNull().default("published"),
  importance: integer("importance").notNull().default(50),
  socialStatus: text("social_status").notNull().default("pending"),
  league: text("league"),
}, (table) => [
  uniqueIndex("articles_slug_unique").on(table.slug),
  uniqueIndex("articles_source_url_unique").on(table.sourceUrl),
]);

export const publicationLogs = sqliteTable("publication_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleId: integer("article_id").notNull(),
  platform: text("platform").notNull(),
  status: text("status").notNull(),
  externalId: text("external_id"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const automationRuns = sqliteTable("automation_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  status: text("status").notNull(),
  foundCount: integer("found_count").notNull().default(0),
  publishedCount: integer("published_count").notNull().default(0),
  error: text("error"),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  finishedAt: text("finished_at"),
});

export const apiCache = sqliteTable("api_cache", {
  cacheKey: text("cache_key").primaryKey(),
  payload: text("payload").notNull().default("[]"),
  savedAt: integer("saved_at").notNull().default(0),
  retryAfter: integer("retry_after").notNull().default(0),
});

export const comments = sqliteTable("comments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  articleSlug: text("article_slug").notNull(),
  author: text("author").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
