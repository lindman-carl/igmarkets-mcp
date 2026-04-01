CREATE TABLE `accounts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`ig_api_key` text NOT NULL,
	`ig_username` text NOT NULL,
	`ig_password` text NOT NULL,
	`is_demo` integer DEFAULT true NOT NULL,
	`strategy_id` integer NOT NULL,
	`interval_minutes` integer DEFAULT 15 NOT NULL,
	`timezone` text DEFAULT 'Europe/London' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_name_unique` ON `accounts` (`name`);--> statement-breakpoint
CREATE INDEX `accounts_strategy_id_idx` ON `accounts` (`strategy_id`);--> statement-breakpoint
CREATE INDEX `accounts_is_active_idx` ON `accounts` (`is_active`);--> statement-breakpoint
CREATE TABLE `bot_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `positions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer,
	`deal_id` text NOT NULL,
	`epic` text NOT NULL,
	`direction` text NOT NULL,
	`size` real NOT NULL,
	`entry_price` real NOT NULL,
	`current_stop` real,
	`current_limit` real,
	`strategy` text,
	`status` text DEFAULT 'open' NOT NULL,
	`exit_price` real,
	`realized_pnl` real,
	`currency_code` text NOT NULL,
	`expiry` text NOT NULL,
	`opened_at` text NOT NULL,
	`closed_at` text,
	`open_trade_id` integer,
	`close_trade_id` integer,
	`metadata` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `positions_deal_id_unique` ON `positions` (`deal_id`);--> statement-breakpoint
CREATE INDEX `positions_epic_idx` ON `positions` (`epic`);--> statement-breakpoint
CREATE INDEX `positions_status_idx` ON `positions` (`status`);--> statement-breakpoint
CREATE INDEX `positions_account_id_idx` ON `positions` (`account_id`);--> statement-breakpoint
CREATE TABLE `signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer,
	`tick_id` integer NOT NULL,
	`epic` text NOT NULL,
	`strategy` text NOT NULL,
	`action` text NOT NULL,
	`signal_type` text NOT NULL,
	`confidence` real,
	`price_at_signal` real,
	`suggested_stop` real,
	`suggested_limit` real,
	`suggested_size` real,
	`acted` integer DEFAULT false,
	`skip_reason` text,
	`created_at` text NOT NULL,
	`indicator_data` text
);
--> statement-breakpoint
CREATE INDEX `signals_tick_id_idx` ON `signals` (`tick_id`);--> statement-breakpoint
CREATE INDEX `signals_epic_idx` ON `signals` (`epic`);--> statement-breakpoint
CREATE INDEX `signals_created_at_idx` ON `signals` (`created_at`);--> statement-breakpoint
CREATE INDEX `signals_account_id_idx` ON `signals` (`account_id`);--> statement-breakpoint
CREATE TABLE `strategies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`prompt` text NOT NULL,
	`strategy_type` text NOT NULL,
	`strategy_params` text,
	`risk_config` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `strategies_name_unique` ON `strategies` (`name`);--> statement-breakpoint
CREATE INDEX `strategies_is_active_idx` ON `strategies` (`is_active`);--> statement-breakpoint
CREATE TABLE `ticks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer,
	`started_at` text NOT NULL,
	`completed_at` text,
	`status` text DEFAULT 'running' NOT NULL,
	`instruments_scanned` integer DEFAULT 0,
	`signals_generated` integer DEFAULT 0,
	`trades_executed` integer DEFAULT 0,
	`error` text,
	`metadata` text
);
--> statement-breakpoint
CREATE INDEX `ticks_started_at_idx` ON `ticks` (`started_at`);--> statement-breakpoint
CREATE INDEX `ticks_account_id_idx` ON `ticks` (`account_id`);--> statement-breakpoint
CREATE TABLE `trades` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`account_id` integer,
	`tick_id` integer NOT NULL,
	`signal_id` integer,
	`deal_reference` text,
	`deal_id` text,
	`epic` text NOT NULL,
	`direction` text NOT NULL,
	`size` real NOT NULL,
	`order_type` text NOT NULL,
	`execution_price` real,
	`stop_level` real,
	`limit_level` real,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`reject_reason` text,
	`currency_code` text NOT NULL,
	`expiry` text NOT NULL,
	`created_at` text NOT NULL,
	`confirmation_data` text
);
--> statement-breakpoint
CREATE INDEX `trades_tick_id_idx` ON `trades` (`tick_id`);--> statement-breakpoint
CREATE INDEX `trades_deal_id_idx` ON `trades` (`deal_id`);--> statement-breakpoint
CREATE INDEX `trades_epic_idx` ON `trades` (`epic`);--> statement-breakpoint
CREATE INDEX `trades_created_at_idx` ON `trades` (`created_at`);--> statement-breakpoint
CREATE INDEX `trades_account_id_idx` ON `trades` (`account_id`);