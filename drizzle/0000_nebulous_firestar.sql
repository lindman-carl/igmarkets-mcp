CREATE TABLE "account_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"balance" double precision NOT NULL,
	"equity" double precision NOT NULL,
	"margin" double precision DEFAULT 0 NOT NULL,
	"profit_loss" double precision DEFAULT 0 NOT NULL,
	"available_funds" double precision DEFAULT 0 NOT NULL,
	"snapshot_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_demo" boolean DEFAULT true NOT NULL,
	"strategy_id" integer NOT NULL,
	"interval_minutes" integer DEFAULT 15 NOT NULL,
	"timezone" text DEFAULT 'Europe/London' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "candles" (
	"id" serial PRIMARY KEY NOT NULL,
	"epic" text NOT NULL,
	"resolution" text NOT NULL,
	"timestamp" timestamp with time zone NOT NULL,
	"open" double precision NOT NULL,
	"high" double precision NOT NULL,
	"low" double precision NOT NULL,
	"close" double precision NOT NULL,
	"volume" double precision,
	CONSTRAINT "candles_epic_resolution_timestamp_uq" UNIQUE("epic","resolution","timestamp")
);
--> statement-breakpoint
CREATE TABLE "instruments" (
	"id" serial PRIMARY KEY NOT NULL,
	"epic" text NOT NULL,
	"name" text NOT NULL,
	"min_deal_size" double precision NOT NULL,
	"tick_size" double precision,
	"margin_factor" double precision,
	"currency_code" text NOT NULL,
	"expiry" text,
	"trading_hours" jsonb,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "instruments_epic_unique" UNIQUE("epic")
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"deal_id" text NOT NULL,
	"epic" text NOT NULL,
	"direction" text NOT NULL,
	"size" double precision NOT NULL,
	"entry_price" double precision NOT NULL,
	"current_stop" double precision,
	"current_limit" double precision,
	"strategy" text,
	"status" text DEFAULT 'open' NOT NULL,
	"exit_price" double precision,
	"realized_pnl" double precision,
	"currency_code" text NOT NULL,
	"expiry" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"open_trade_id" integer,
	"close_trade_id" integer,
	"metadata" jsonb,
	CONSTRAINT "positions_deal_id_unique" UNIQUE("deal_id")
);
--> statement-breakpoint
CREATE TABLE "risk_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"tripped" boolean DEFAULT false NOT NULL,
	"consecutive_losses" integer DEFAULT 0 NOT NULL,
	"consecutive_errors" integer DEFAULT 0 NOT NULL,
	"last_tripped_at" timestamp with time zone,
	"cooldown_until" timestamp with time zone,
	"total_losses_today" double precision DEFAULT 0 NOT NULL,
	"daily_pnl" double precision DEFAULT 0 NOT NULL,
	"last_daily_reset_date" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "risk_state_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
CREATE TABLE "signals" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"tick_id" integer NOT NULL,
	"epic" text NOT NULL,
	"strategy" text NOT NULL,
	"action" text NOT NULL,
	"signal_type" text NOT NULL,
	"confidence" double precision,
	"price_at_signal" double precision,
	"suggested_stop" double precision,
	"suggested_limit" double precision,
	"suggested_size" double precision,
	"acted" boolean DEFAULT false,
	"skip_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"indicator_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "strategies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"strategy_type" text NOT NULL,
	"strategy_params" jsonb,
	"risk_config" jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "strategies_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "ticks" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"status" text DEFAULT 'running' NOT NULL,
	"instruments_scanned" integer DEFAULT 0,
	"signals_generated" integer DEFAULT 0,
	"trades_executed" integer DEFAULT 0,
	"error" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"tick_id" integer NOT NULL,
	"signal_id" integer,
	"deal_reference" text,
	"deal_id" text,
	"epic" text NOT NULL,
	"direction" text NOT NULL,
	"size" double precision NOT NULL,
	"order_type" text NOT NULL,
	"execution_price" double precision,
	"stop_level" double precision,
	"limit_level" double precision,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"reject_reason" text,
	"currency_code" text NOT NULL,
	"expiry" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmation_data" jsonb
);
--> statement-breakpoint
CREATE INDEX "account_snapshots_account_id_idx" ON "account_snapshots" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "account_snapshots_snapshot_at_idx" ON "account_snapshots" USING btree ("snapshot_at");--> statement-breakpoint
CREATE INDEX "accounts_strategy_id_idx" ON "accounts" USING btree ("strategy_id");--> statement-breakpoint
CREATE INDEX "accounts_is_active_idx" ON "accounts" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "candles_epic_resolution_idx" ON "candles" USING btree ("epic","resolution");--> statement-breakpoint
CREATE INDEX "candles_timestamp_idx" ON "candles" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "instruments_currency_code_idx" ON "instruments" USING btree ("currency_code");--> statement-breakpoint
CREATE INDEX "positions_epic_idx" ON "positions" USING btree ("epic");--> statement-breakpoint
CREATE INDEX "positions_status_idx" ON "positions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "positions_account_id_idx" ON "positions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "risk_state_account_id_idx" ON "risk_state" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "signals_tick_id_idx" ON "signals" USING btree ("tick_id");--> statement-breakpoint
CREATE INDEX "signals_epic_idx" ON "signals" USING btree ("epic");--> statement-breakpoint
CREATE INDEX "signals_created_at_idx" ON "signals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "signals_account_id_idx" ON "signals" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "strategies_is_active_idx" ON "strategies" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "ticks_started_at_idx" ON "ticks" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "ticks_account_id_idx" ON "ticks" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "trades_tick_id_idx" ON "trades" USING btree ("tick_id");--> statement-breakpoint
CREATE INDEX "trades_deal_id_idx" ON "trades" USING btree ("deal_id");--> statement-breakpoint
CREATE INDEX "trades_epic_idx" ON "trades" USING btree ("epic");--> statement-breakpoint
CREATE INDEX "trades_created_at_idx" ON "trades" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "trades_account_id_idx" ON "trades" USING btree ("account_id");