CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`uid` text NOT NULL,
	`mime` text NOT NULL
);

--> statement-breakpoint
CREATE TABLE `deliveries` (
	`key` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`updated` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `devices` (
	`token` text PRIMARY KEY NOT NULL,
	`uid` text NOT NULL,
	`session` text NOT NULL,
	`updated` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);

--> statement-breakpoint
CREATE TABLE `operations` (
	`uid` text NOT NULL,
	`id` text NOT NULL,
	`version` integer NOT NULL,
	PRIMARY KEY(`uid`, `id`)
);

--> statement-breakpoint
CREATE TABLE `spaces` (
	`uid` text PRIMARY KEY NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`updated` integer NOT NULL
);

