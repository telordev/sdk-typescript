/**
 * Typed wire models for the Simse public API. JSON field names are snake_case
 * (the wire); the SDK's public *method* surface is camelCase. Content blocks and
 * stream events are discriminated unions on `type`.
 */

// ─── Messages: content blocks (request side) ─────────────────────────────────

export interface TextBlockParam {
  type: "text";
  text: string;
}

export interface ImageBlockParam {
  type: "image";
  source: {
    type: "base64";
    media_type: string;
    data: string;
  };
}

export interface ToolUseBlockParam {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlockParam {
  type: "tool_result";
  tool_use_id: string;
  content?: string | Array<TextBlockParam | ImageBlockParam>;
  is_error?: boolean;
}

export interface ThinkingBlockParam {
  type: "thinking";
  thinking: string;
}

export type ContentBlockParam =
  | TextBlockParam
  | ImageBlockParam
  | ToolUseBlockParam
  | ToolResultBlockParam
  | ThinkingBlockParam;

export type Role = "user" | "assistant";

export interface MessageParam {
  role: Role;
  content: string | ContentBlockParam[];
}

// ─── Messages: content blocks (response side) ────────────────────────────────

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export type ContentBlock = TextBlock | ToolUseBlock;

export type StopReason =
  | "end_turn"
  | "max_tokens"
  | "stop_sequence"
  | "tool_use"
  | null;

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

/** The non-stream `Message` response object (Anthropic-shaped). */
export interface Message {
  id: string;
  type: "message";
  role: "assistant";
  model: string;
  content: ContentBlock[];
  stop_reason: StopReason;
  stop_sequence: string | null;
  usage: Usage;
  /** Populated by the SDK: the `request-id` response header. */
  _request_id?: string | null;
}

// ─── Tools ───────────────────────────────────────────────────────────────────

export interface Tool {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

export type ToolChoice =
  | { type: "auto" }
  | { type: "any" }
  | { type: "none" }
  | { type: "tool"; name: string };

export interface Metadata {
  user_id?: string;
}

// ─── Messages: request params ────────────────────────────────────────────────

export interface MessageCreateParamsBase {
  model: string;
  messages: MessageParam[];
  max_tokens: number;
  system?: string | TextBlockParam[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stop_sequences?: string[];
  tools?: Tool[];
  tool_choice?: ToolChoice;
  metadata?: Metadata;
}

export interface MessageCreateParamsNonStreaming
  extends MessageCreateParamsBase {
  stream?: false;
}

export interface MessageCreateParamsStreaming extends MessageCreateParamsBase {
  stream: true;
}

export type MessageCreateParams =
  | MessageCreateParamsNonStreaming
  | MessageCreateParamsStreaming;

export type MessageStreamParams = MessageCreateParamsBase;

export interface CountTokensParams {
  model?: string;
  messages: MessageParam[];
  system?: string | TextBlockParam[];
  tools?: Tool[];
}

export interface TokenCount {
  input_tokens: number;
}

// ─── Messages: streaming events (Anthropic named SSE events) ─────────────────

export interface MessageStartEvent {
  type: "message_start";
  message: Message;
}

export interface ContentBlockStartEvent {
  type: "content_block_start";
  index: number;
  content_block: ContentBlock;
}

export interface TextDelta {
  type: "text_delta";
  text: string;
}

export interface InputJSONDelta {
  type: "input_json_delta";
  partial_json: string;
}

export type ContentBlockDelta = TextDelta | InputJSONDelta;

export interface ContentBlockDeltaEvent {
  type: "content_block_delta";
  index: number;
  delta: ContentBlockDelta;
}

export interface ContentBlockStopEvent {
  type: "content_block_stop";
  index: number;
}

export interface MessageDeltaEvent {
  type: "message_delta";
  delta: { stop_reason: StopReason; stop_sequence: string | null };
  usage: { output_tokens: number };
}

export interface MessageStopEvent {
  type: "message_stop";
}

export interface PingEvent {
  type: "ping";
}

export interface ErrorEvent {
  type: "error";
  error: { type: string; message: string };
}

export type MessageStreamEvent =
  | MessageStartEvent
  | ContentBlockStartEvent
  | ContentBlockDeltaEvent
  | ContentBlockStopEvent
  | MessageDeltaEvent
  | MessageStopEvent
  | PingEvent
  | ErrorEvent;

// ─── Models ──────────────────────────────────────────────────────────────────

export interface Model {
  id: string;
  type: "model";
  display_name: string;
  created_at: string;
  max_input_tokens: number;
  max_tokens: number;
}

export interface ModelListParams {
  limit?: number;
  before_id?: string;
  after_id?: string;
}

export interface ModelList {
  data: Model[];
  has_more: boolean;
  first_id: string | null;
  last_id: string | null;
}

// ─── Agents (subagent run history) ───────────────────────────────────────────

/** One subagent run record (newest-first), from `GET /v1/agents`. */
export interface Agent {
  id: string;
  description: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  turns: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  error: string | null;
}

export interface AgentList {
  agents: Agent[];
}

// ─── Account / usage / billing ───────────────────────────────────────────────

export interface Account {
  id: string;
  user_id: string;
  plan: string;
}

export interface UsageSummary {
  period: string;
  requests: number;
  tokens: number;
  by_model: Record<string, number>;
}

export interface Billing {
  plan: string;
  status: string;
  limits: Record<string, unknown>;
  current_usage: Record<string, unknown>;
}

// ─── Usage dashboard (the rich UsagePanel view) ──────────────────────────────
//
// `GET /v1/usage/dashboard` is assembled by warp from payments + tally and emits
// **camelCase** wire keys (Connect serializes int64/uint64 as numbers here). The
// SDK surfaces those keys verbatim, as a typed object.

export interface UsageDashboardModel {
  model: string;
  includedInputTokens: number;
  includedOutputTokens: number;
  extraInputTokens: number;
  extraOutputTokens: number;
  extraSpendCents: number;
  requestCount: number;
  multiplier: number;
}

export interface UsageDashboardBilling {
  extraUsageEnabled: boolean;
  extraUsageCapCents: number;
  creditsBalanceCents: number;
  extraSpendThisPeriodCents: number;
  planIncludedTokens: number;
}

/** The 5h compute-session window (omitted when the user has no session row). */
export interface UsageDashboardSession {
  state: string;
  startedAt: number;
  expiresAt: number;
  cooldownUntil: number;
  usedMs: number;
  limitMs: number;
  inFlight: number;
}

export interface UsageDashboardCompute {
  session?: {
    current?: UsageDashboardSession;
  };
}

export interface UsageDashboard {
  plan: string;
  periodStart: number;
  models: UsageDashboardModel[];
  billing: UsageDashboardBilling;
  /** Present only when a compute-session row exists for the caller. */
  compute?: UsageDashboardCompute;
}

// ─── Sessions ──────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  model?: string | null;
  title?: string;
  status: string;
  created_at: string;
  updated_at?: string;
  message_count?: number;
}

export interface SessionCreateParams {
  model?: string;
  title?: string;
}

export interface SessionList {
  sessions: Session[];
}

export interface SessionPromptParams {
  content: string;
  stream?: boolean;
}

export interface PromptUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface SessionPromptResult {
  message: { role: "assistant"; content: string };
  usage: PromptUsage;
}

// Session-prompt streaming events (legacy SSE: `data: {json}` + `[DONE]`).
export interface SessionDeltaEvent {
  type: "delta";
  delta: string;
}
export interface SessionToolCallEvent {
  type: "tool_call";
  id: string;
  name: string;
  input: unknown;
}
export interface SessionToolResultEvent {
  type: "tool_result";
  id: string;
  output: string;
  is_error: boolean;
}
export interface SessionDoneEvent {
  type: "done";
  status: string;
  text: string;
  usage: PromptUsage;
}
export interface SessionErrorEvent {
  type: "error";
  message: string;
}

export type SessionStreamEvent =
  | SessionDeltaEvent
  | SessionToolCallEvent
  | SessionToolResultEvent
  | SessionDoneEvent
  | SessionErrorEvent;

export interface SessionResumeResult {
  messages: Array<{
    role: string;
    content: string;
    images?: string | null;
    created_at: string;
  }>;
  tool_calls: Array<{
    id: string;
    name: string;
    input: string;
    output: string;
    status: string;
    created_at: string;
  }>;
}

// ─── Memories ──────────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  text: string;
  metadata: Record<string, string>;
  created_at: string;
  score?: number;
}

export interface MemoryList {
  memories: Memory[];
}

export interface MemoryCreateParams {
  text: string;
  metadata?: Record<string, string>;
}

export interface MemoryListParams {
  query?: string;
  limit?: number;
}

export interface MemoryStats {
  count: number;
  last_added_at: string;
}

// ─── Plugins ───────────────────────────────────────────────────────────────────

export interface PluginTool {
  name: string;
  description: string;
  category: string;
  parameters: unknown;
}

export interface Plugin {
  name: string;
  kind: string;
  status: string;
  configurable: boolean;
  config_keys: string[];
  error: string;
}

export interface PluginsList {
  tools: PluginTool[];
  plugins: Plugin[];
}

export interface RegistryEntry {
  id: string;
  name: string;
  kind: string;
  description: string;
  version: string;
  author: string;
  required_secrets: string[];
}

export interface RegistryList {
  plugins: RegistryEntry[];
}

export interface RegistryDetail {
  plugin_id: string;
  manifest: unknown;
  readme: string;
}

export interface InstalledPlugin {
  plugin_name: string;
  enabled: boolean;
  permissions: string[];
  updated_at: string;
}

export interface InstalledList {
  installed: InstalledPlugin[];
}

export interface PluginInstallParams {
  plugin_name: string;
  permissions?: string[];
  secrets?: Record<string, string>;
}

export interface PluginUninstallParams {
  plugin_name: string;
}

// ─── PM: tasks / projects / todos / schedules / workflows ────────────────────

export interface Task {
  taskId: string;
  projectId?: string | null;
  parentTaskId?: string | null;
  title: string;
  description?: string | null;
  status: string;
  priority?: string | null;
  labels: unknown;
  checklist: unknown;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  projectId: string;
  name: string;
  description?: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BoardDep {
  taskId: string;
  blocksTaskId: string;
}

export interface Board {
  tasks: Task[];
  projects: Project[];
  deps: BoardDep[];
}

export interface TaskDetail {
  task: Task | null;
  subtasks: Task[];
  blocks: string[];
  blockedBy: string[];
}

export interface TaskCreateParams {
  title: string;
  description?: string;
  projectId?: string;
  parentTaskId?: string;
  status?: string;
  priority?: string;
  labels?: unknown;
}

export interface TaskUpdateParams {
  title?: string;
  description?: string;
  status?: string;
  priority?: string;
  projectId?: string;
  labels?: unknown;
}

export interface TaskMoveParams {
  status: string;
  sortOrder?: number;
}

export interface ProjectCreateParams {
  name: string;
  description?: string;
}

export interface ProjectUpdateParams {
  name?: string;
  description?: string;
  archived?: boolean;
}

export interface Schedule {
  taskId: string;
  name: string;
  cronExpr: string;
  actionKind: string;
  actionPayload: unknown;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
}

export interface ScheduleCreateParams {
  name: string;
  cronExpr: string;
  actionKind: string;
  actionPayload?: unknown;
}

export interface ScheduleUpdateParams {
  enabled?: boolean;
  cronExpr?: string;
}

export interface WorkflowSummary {
  workflowId: string;
  name: string;
  compileStatus: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Workflow extends WorkflowSummary {
  source: string;
}

export interface WorkflowCreateParams {
  name: string;
  source: string;
}

export interface WorkflowUpdateParams {
  name?: string;
  source?: string;
  enabled?: boolean;
}

export interface WorkflowLintResult {
  ok: boolean;
  errors: string[];
}

export interface WorkflowRunParams {
  input?: unknown;
  trigger?: string;
}

export interface WorkflowRun {
  runId: string;
  status: string;
}

export interface WorkflowRunEvent {
  seq: number;
  ts: string;
  level: string;
  message: string;
}

export interface WorkflowRunLog {
  runId: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  output?: unknown;
  error?: string | null;
  events: WorkflowRunEvent[];
}

// ─── Flags ─────────────────────────────────────────────────────────────────────

export interface FlagsResponse {
  flags: Record<string, boolean>;
}
