CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`excerpt` text NOT NULL,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`image_url` text,
	`source_name` text NOT NULL,
	`source_url` text NOT NULL,
	`source_published_at` text,
	`published_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`status` text DEFAULT 'published' NOT NULL,
	`importance` integer DEFAULT 50 NOT NULL,
	`social_status` text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_slug_unique` ON `articles` (`slug`);--> statement-breakpoint
CREATE UNIQUE INDEX `articles_source_url_unique` ON `articles` (`source_url`);--> statement-breakpoint
CREATE TABLE `automation_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text NOT NULL,
	`found_count` integer DEFAULT 0 NOT NULL,
	`published_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE TABLE `publication_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`platform` text NOT NULL,
	`status` text NOT NULL,
	`external_id` text,
	`error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`feed_url` text NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_feed_url_unique` ON `sources` (`feed_url`);
--> statement-breakpoint
INSERT OR IGNORE INTO `sources` (`name`, `feed_url`, `language`, `enabled`) VALUES
  ('BBC Sport', 'https://feeds.bbci.co.uk/sport/rss.xml', 'en', 1),
  ('BBC Sport Football', 'https://feeds.bbci.co.uk/sport/football/rss.xml', 'en', 1),
  ('ESPN Soccer', 'https://www.espn.com/espn/rss/soccer/news', 'en', 1),
  ('ESPN NBA', 'https://www.espn.com/espn/rss/nba/news', 'en', 1);
