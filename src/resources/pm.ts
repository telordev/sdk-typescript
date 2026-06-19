import type { BaseClient } from "../client.js";
import type {
  Board,
  Project,
  ProjectCreateParams,
  ProjectUpdateParams,
  Schedule,
  ScheduleCreateParams,
  ScheduleUpdateParams,
  TaskCreateParams,
  TaskDetail,
  TaskMoveParams,
  TaskUpdateParams,
  Workflow,
  WorkflowCreateParams,
  WorkflowLintResult,
  WorkflowRun,
  WorkflowRunLog,
  WorkflowRunParams,
  WorkflowSummary,
  WorkflowUpdateParams,
} from "../types.js";

function enc(s: string): string {
  return encodeURIComponent(s);
}

/**
 * Session-scoped kanban tasks. All paths are under
 * `/v1/sessions/{sessionId}/tasks`.
 */
class Tasks {
  constructor(private readonly client: BaseClient) {}

  /** The full board for a session (optionally filtered by project). */
  async list(sessionId: string, projectId?: string): Promise<Board> {
    const { data } = await this.client.get<Board>(
      `/v1/sessions/${enc(sessionId)}/tasks`,
      { query: { project_id: projectId } },
    );
    return data;
  }

  /** One task + subtasks + dependency edges. */
  async retrieve(sessionId: string, taskId: string): Promise<TaskDetail> {
    const { data } = await this.client.get<TaskDetail>(
      `/v1/sessions/${enc(sessionId)}/tasks/${enc(taskId)}`,
    );
    return data;
  }

  /** Create a task. Returns `{ taskId }`. */
  async create(
    sessionId: string,
    params: TaskCreateParams,
  ): Promise<{ taskId: string }> {
    const { data } = await this.client.post<{ taskId: string }>(
      `/v1/sessions/${enc(sessionId)}/tasks`,
      params,
    );
    return data;
  }

  /** Partial-update a task. */
  async update(
    sessionId: string,
    taskId: string,
    params: TaskUpdateParams,
  ): Promise<{ ok: boolean }> {
    const { data } = await this.client.patch<{ ok: boolean }>(
      `/v1/sessions/${enc(sessionId)}/tasks/${enc(taskId)}`,
      params,
    );
    return data;
  }

  /** Delete a task. */
  async delete(
    sessionId: string,
    taskId: string,
  ): Promise<{ deleted: boolean }> {
    const { data } = await this.client.delete<{ deleted: boolean }>(
      `/v1/sessions/${enc(sessionId)}/tasks/${enc(taskId)}`,
    );
    return data;
  }

  /** Move a card between columns. */
  async move(
    sessionId: string,
    taskId: string,
    params: TaskMoveParams,
  ): Promise<{ ok: boolean }> {
    const { data } = await this.client.post<{ ok: boolean }>(
      `/v1/sessions/${enc(sessionId)}/tasks/${enc(taskId)}/move`,
      params,
    );
    return data;
  }

  /** Replace a task's checklist. */
  async setChecklist(
    sessionId: string,
    taskId: string,
    checklist: unknown,
  ): Promise<{ ok: boolean }> {
    const { data } = await this.client.put<{ ok: boolean }>(
      `/v1/sessions/${enc(sessionId)}/tasks/${enc(taskId)}/checklist`,
      { checklist },
    );
    return data;
  }

  /** Add a dependency (this task is blocked by `blocksTaskId`). */
  async addDependency(
    sessionId: string,
    taskId: string,
    blocksTaskId: string,
  ): Promise<{ ok: boolean }> {
    const { data } = await this.client.post<{ ok: boolean }>(
      `/v1/sessions/${enc(sessionId)}/tasks/${enc(taskId)}/deps`,
      { blocksTaskId },
    );
    return data;
  }

  /** Remove a dependency edge. */
  async removeDependency(
    sessionId: string,
    taskId: string,
    blocksTaskId: string,
  ): Promise<{ ok: boolean }> {
    const { data } = await this.client.delete<{ ok: boolean }>(
      `/v1/sessions/${enc(sessionId)}/tasks/${enc(taskId)}/deps/${enc(
        blocksTaskId,
      )}`,
    );
    return data;
  }
}

/** Session-scoped projects under `/v1/sessions/{sessionId}/projects`. */
class Projects {
  constructor(private readonly client: BaseClient) {}

  async list(sessionId: string): Promise<{ projects: Project[] }> {
    const { data } = await this.client.get<{ projects: Project[] }>(
      `/v1/sessions/${enc(sessionId)}/projects`,
    );
    return data;
  }

  async create(
    sessionId: string,
    params: ProjectCreateParams,
  ): Promise<{ projectId: string }> {
    const { data } = await this.client.post<{ projectId: string }>(
      `/v1/sessions/${enc(sessionId)}/projects`,
      params,
    );
    return data;
  }

  async update(
    sessionId: string,
    projectId: string,
    params: ProjectUpdateParams,
  ): Promise<{ ok: boolean }> {
    const { data } = await this.client.patch<{ ok: boolean }>(
      `/v1/sessions/${enc(sessionId)}/projects/${enc(projectId)}`,
      params,
    );
    return data;
  }

  async delete(
    sessionId: string,
    projectId: string,
  ): Promise<{ deleted: boolean }> {
    const { data } = await this.client.delete<{ deleted: boolean }>(
      `/v1/sessions/${enc(sessionId)}/projects/${enc(projectId)}`,
    );
    return data;
  }
}

/** Session-scoped read-only todos. */
class Todos {
  constructor(private readonly client: BaseClient) {}

  async list(sessionId: string): Promise<{ todos: unknown }> {
    const { data } = await this.client.get<{ todos: unknown }>(
      `/v1/sessions/${enc(sessionId)}/todos`,
    );
    return data;
  }
}

/** User-scoped cron schedules under `/v1/schedules`. */
class Schedules {
  constructor(private readonly client: BaseClient) {}

  async list(): Promise<{ schedules: Schedule[] }> {
    const { data } = await this.client.get<{ schedules: Schedule[] }>(
      "/v1/schedules",
    );
    return data;
  }

  async create(
    params: ScheduleCreateParams,
  ): Promise<{ taskId: string }> {
    const { data } = await this.client.post<{ taskId: string }>(
      "/v1/schedules",
      params,
    );
    return data;
  }

  async update(
    taskId: string,
    params: ScheduleUpdateParams,
  ): Promise<{ updated: boolean }> {
    const { data } = await this.client.patch<{ updated: boolean }>(
      `/v1/schedules/${enc(taskId)}`,
      params,
    );
    return data;
  }

  async delete(taskId: string): Promise<{ deleted: boolean }> {
    const { data } = await this.client.delete<{ deleted: boolean }>(
      `/v1/schedules/${enc(taskId)}`,
    );
    return data;
  }
}

/** User-scoped workflows under `/v1/workflows`. */
class Workflows {
  constructor(private readonly client: BaseClient) {}

  async list(): Promise<{ workflows: WorkflowSummary[] }> {
    const { data } = await this.client.get<{ workflows: WorkflowSummary[] }>(
      "/v1/workflows",
    );
    return data;
  }

  async retrieve(workflowId: string): Promise<Workflow> {
    const { data } = await this.client.get<Workflow>(
      `/v1/workflows/${enc(workflowId)}`,
    );
    return data;
  }

  async create(
    params: WorkflowCreateParams,
  ): Promise<{ workflowId: string }> {
    const { data } = await this.client.post<{ workflowId: string }>(
      "/v1/workflows",
      params,
    );
    return data;
  }

  async update(
    workflowId: string,
    params: WorkflowUpdateParams,
  ): Promise<{ ok: boolean }> {
    const { data } = await this.client.patch<{ ok: boolean }>(
      `/v1/workflows/${enc(workflowId)}`,
      params,
    );
    return data;
  }

  async delete(workflowId: string): Promise<{ deleted: boolean }> {
    const { data } = await this.client.delete<{ deleted: boolean }>(
      `/v1/workflows/${enc(workflowId)}`,
    );
    return data;
  }

  /** Compile-check a workflow source. */
  async lint(source: string): Promise<WorkflowLintResult> {
    const { data } = await this.client.post<WorkflowLintResult>(
      "/v1/workflows/lint",
      { source },
    );
    return data;
  }

  /** Run a workflow. Returns `{ runId, status }`. */
  async run(
    workflowId: string,
    params: WorkflowRunParams = {},
  ): Promise<WorkflowRun> {
    const { data } = await this.client.post<WorkflowRun>(
      `/v1/workflows/${enc(workflowId)}/run`,
      params,
    );
    return data;
  }

  /** Fetch a run's status + events + output. */
  async run_logs(runId: string): Promise<WorkflowRunLog> {
    return this.getRun(runId);
  }

  /** Fetch a run's status + events + output. */
  async getRun(runId: string): Promise<WorkflowRunLog> {
    const { data } = await this.client.get<WorkflowRunLog>(
      `/v1/workflows/runs/${enc(runId)}`,
    );
    return data;
  }

  /** Cancel a running workflow. */
  async cancelRun(runId: string): Promise<{ cancelled: boolean }> {
    const { data } = await this.client.post<{ cancelled: boolean }>(
      `/v1/workflows/runs/${enc(runId)}/cancel`,
    );
    return data;
  }
}

/**
 * The `pm` (project-management) resource namespace, grouping the kanban,
 * project, todo, schedule, and workflow sub-resources.
 */
export class PM {
  readonly tasks: Tasks;
  readonly projects: Projects;
  readonly todos: Todos;
  readonly schedules: Schedules;
  readonly workflows: Workflows;

  constructor(client: BaseClient) {
    this.tasks = new Tasks(client);
    this.projects = new Projects(client);
    this.todos = new Todos(client);
    this.schedules = new Schedules(client);
    this.workflows = new Workflows(client);
  }
}
