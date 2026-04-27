CREATE TABLE `api_keys` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(64) NOT NULL,
	`key_value` text NOT NULL,
	`key_masked` varchar(64) NOT NULL,
	`validity` enum('valid','invalid','unknown','rate_limited') NOT NULL DEFAULT 'unknown',
	`last_checked_at` timestamp NOT NULL DEFAULT (now()),
	`last_used_at` timestamp,
	`usage_count` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `api_keys_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`event_type` varchar(64) NOT NULL,
	`provider` varchar(64),
	`key_id` int,
	`details` text,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `provider_stats` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` varchar(64) NOT NULL,
	`valid_key_count` int NOT NULL DEFAULT 0,
	`total_key_count` int NOT NULL DEFAULT 0,
	`last_refresh_at` timestamp,
	`active_key_id` int,
	`total_requests` int NOT NULL DEFAULT 0,
	`failed_requests` int NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `provider_stats_id` PRIMARY KEY(`id`),
	CONSTRAINT `provider_stats_provider_unique` UNIQUE(`provider`)
);
