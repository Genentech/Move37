import type {
  ContextInput,
  ContextOutput,
  ExerciseClassifyOutput,
  ExerciseCreateInput,
  ExerciseGraphOutput,
  ExerciseListFilters,
  ExerciseListItem,
  ExerciseSearchItem,
  ExerciseSearchQuery,
  LoginInput,
  LoginOutput,
  PerformanceOutput,
  PracticeEndOutput,
  PracticeStartInput,
  PracticeStartOutput,
  PracticeSubmitInput,
  PracticeSubmitOutput,
  TrainImportItem,
  TrainImportOutput,
} from "./types";

export interface PenroseLamarckClientOptions {
  baseUrl: string;
  token?: string;
  defaultHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `Penrose-Lamarck API request failed with status ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class PenroseLamarckClient {
  private readonly baseUrl: string;
  private token?: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: PenroseLamarckClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.fetchImpl =
      options.fetchImpl ??
      ((input: RequestInfo | URL, init?: RequestInit) => globalThis.fetch(input, init));
  }

  setToken(token?: string): void {
    this.token = token;
  }

  async authLogin(payload: LoginInput): Promise<LoginOutput> {
    return this.request<LoginOutput>("POST", "/v1/auth/login", { body: payload, auth: false });
  }

  async authMe(): Promise<LoginOutput> {
    return this.request<LoginOutput>("GET", "/v1/auth/me");
  }

  async getStudyContext(): Promise<ContextOutput> {
    return this.request<ContextOutput>("GET", "/v1/study/context");
  }

  async setStudyContext(payload: ContextInput): Promise<ContextOutput> {
    return this.request<ContextOutput>("POST", "/v1/study/context", { body: payload });
  }

  async createExercise(payload: ExerciseCreateInput): Promise<ExerciseListItem> {
    return this.request<ExerciseListItem>("POST", "/v1/exercise", { body: payload });
  }

  async listExercises(filters: ExerciseListFilters = {}): Promise<ExerciseListItem[]> {
    return this.request<ExerciseListItem[]>("GET", "/v1/exercise", { query: filters });
  }

  async getExerciseGraph(language?: string): Promise<ExerciseGraphOutput> {
    return this.request<ExerciseGraphOutput>("GET", "/v1/exercise/graph", {
      query: language ? { language } : undefined,
    });
  }

  async searchExercises(query: ExerciseSearchQuery): Promise<ExerciseSearchItem[]> {
    return this.request<ExerciseSearchItem[]>("GET", "/v1/exercise/search", { query });
  }

  async classifyExercises(limit = 50): Promise<ExerciseClassifyOutput> {
    return this.request<ExerciseClassifyOutput>("POST", "/v1/exercise/classify", {
      query: { limit },
    });
  }

  async trainImport(payload: TrainImportItem[]): Promise<TrainImportOutput> {
    return this.request<TrainImportOutput>("POST", "/v1/train/import", { body: payload });
  }

  async practiceStart(payload: PracticeStartInput): Promise<PracticeStartOutput> {
    return this.request<PracticeStartOutput>("POST", "/v1/practice/start", { body: payload });
  }

  async practiceNext(sessionId: string): Promise<ExerciseListItem> {
    return this.request<ExerciseListItem>("GET", "/v1/practice/next", { query: { sessionId } });
  }

  async practiceSubmit(payload: PracticeSubmitInput): Promise<PracticeSubmitOutput> {
    return this.request<PracticeSubmitOutput>("POST", "/v1/practice/submit", { body: payload });
  }

  async practiceEnd(sessionId: string): Promise<PracticeEndOutput> {
    return this.request<PracticeEndOutput>("POST", "/v1/practice/end", { query: { sessionId } });
  }

  async metricsPerformance(language: string): Promise<PerformanceOutput> {
    return this.request<PerformanceOutput>("GET", "/v1/metrics/performance", {
      query: { language },
    });
  }

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    opts?: {
      auth?: boolean;
      query?: object;
      body?: unknown;
    }
  ): Promise<T> {
    const query = toQueryString(opts?.query);
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ""}`;
    const headers: Record<string, string> = {
      ...this.defaultHeaders,
    };

    if (opts?.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const needsAuth = opts?.auth ?? true;
    if (needsAuth && this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: opts?.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (response.status === 204) {
      return null as T;
    }

    const textBody = await response.text();
    const parsedBody = parseBody(textBody);

    if (!response.ok) {
      throw new ApiError(response.status, parsedBody);
    }

    return parsedBody as T;
  }
}

function parseBody(value: string): unknown {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toQueryString(input?: object): string {
  if (!input) {
    return "";
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, String(item));
      }
      continue;
    }
    params.append(key, String(value));
  }
  return params.toString();
}
