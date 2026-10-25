CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant` text NOT NULL,
	`order_id` text NOT NULL,
	`at` text NOT NULL,
	`duplicate` integer NOT NULL,
	`channel` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `orders` (
	`tenant` text NOT NULL,
	`id` text NOT NULL,
	`hash` text NOT NULL,
	`payload` text NOT NULL,
	`total` integer NOT NULL,
	`receipt` text NOT NULL,
	`received_at` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`channel` text NOT NULL,
	PRIMARY KEY(`tenant`, `id`)
);
