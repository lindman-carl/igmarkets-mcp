/**
 * OpenClaw Plugin API type definitions
 *
 * These types represent the OpenClaw Plugin SDK API surface used by this plugin.
 * In production, these are provided by the `openclaw` peer dependency.
 * Defined here for type safety during development without the SDK installed.
 */

import type { TObject, TProperties } from "@sinclair/typebox";

/** Tool content item returned from tool execution */
export interface ToolContent {
  type: "text";
  text: string;
}

/** Result returned from tool execute() */
export interface ToolResult {
  content: ToolContent[];
}

/** Tool registration options */
export interface ToolRegistration<T extends TProperties = TProperties> {
  name: string;
  description: string;
  parameters: TObject<T>;
  execute: (id: string, params: Record<string, any>) => Promise<ToolResult>;
}

/** Logger interface provided by the plugin API */
export interface PluginLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
}

/** Event data for before_tool_call hook */
export interface BeforeToolCallEvent {
  toolName: string;
  params: Record<string, unknown>;
}

/** Decision returned from before_tool_call hook */
export interface HookDecision {
  requireApproval?: boolean;
  block?: boolean;
}

/** Plugin configuration from openclaw.json */
export interface IGPluginConfig {
  apiKey?: string;
  username?: string;
  password?: string;
  isDemo?: boolean;
  tradeApproval?: boolean;
}

/** OpenClaw Plugin API passed to register() */
export interface OpenClawPluginApi {
  registerTool<T extends TProperties = TProperties>(
    tool: ToolRegistration<T>,
  ): void;
  on(
    event: "before_tool_call",
    handler: (event: BeforeToolCallEvent) => HookDecision,
  ): void;
  pluginConfig: IGPluginConfig;
  logger: PluginLogger;
}

/** Plugin entry definition */
export interface PluginEntryDefinition {
  id: string;
  name: string;
  description: string;
  register(api: OpenClawPluginApi): void;
}
