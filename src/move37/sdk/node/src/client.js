import packageJson from "../package.json" with { type: "json" };

export class ApiError extends Error {
  constructor(status, body, message) {
    super(message ?? deriveErrorMessage(status, body));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

const SDK_VERSION = packageJson.version;
const INIT_LOG_KEYS = getGlobalSet("__move37SdkInitKeys");

export class Move37Client {
  constructor(options) {
    this.baseUrl = String(options.baseUrl ?? "").replace(/\/$/, "");
    this.token = options.token;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.fetchImpl =
      options.fetchImpl ??
      ((input, init) => globalThis.fetch(input, init));
    this.apiUrl = resolveApiUrl(this.baseUrl);
    this.environment = inferEnvironment(this.apiUrl);
    this.localLoggingEnabled = this.environment === "local";

    this.logInit();
  }

  setToken(token) {
    this.token = token;
  }

  authMe() {
    return this.request("GET", "/v1/auth/me");
  }

  getGraph() {
    return this.request("GET", "/v1/graph");
  }

  getAppleCalendarStatus() {
    return this.request("GET", "/v1/calendars/apple/status");
  }

  getAppleIntegrationStatus() {
    return this.request("GET", "/v1/integrations/apple/status");
  }

  connectAppleCalendar(payload) {
    return this.request("POST", "/v1/integrations/apple/connect", {
      body: payload,
    });
  }

  disconnectAppleCalendar() {
    return this.request("POST", "/v1/integrations/apple/disconnect");
  }

  updateAppleCalendarPreferences(payload) {
    return this.request("PUT", "/v1/integrations/apple/preferences", {
      body: payload,
    });
  }

  listAppleCalendarEvents({ start, end }) {
    return this.request("GET", "/v1/calendars/apple/events", {
      query: { start, end },
    });
  }

  reconcileAppleCalendar() {
    return this.request("POST", "/v1/calendars/apple/reconcile");
  }

  replanSchedule({ mode, parameters = {} }) {
    return this.request("POST", "/v1/scheduling/replan", {
      body: { mode, parameters },
    });
  }

  createActivity(payload) {
    this.logOperation("createActivity", { title: payload?.title, parentIds: payload?.parentIds });
    return this.request("POST", "/v1/activities", { body: payload });
  }

  listNotes() {
    return this.request("GET", "/v1/notes");
  }

  getNote(noteId) {
    return this.request("GET", `/v1/notes/${encodeURIComponent(noteId)}`);
  }

  createNote(payload) {
    this.logOperation("createNote", { title: payload?.title });
    return this.request("POST", "/v1/notes", { body: payload });
  }

  updateNote(noteId, payload) {
    this.logOperation("updateNote", { noteId, title: payload?.title });
    return this.request("PATCH", `/v1/notes/${encodeURIComponent(noteId)}`, { body: payload });
  }

  importTxtNotes(formData) {
    this.logOperation("importTxtNotes", { hasFormData: Boolean(formData) });
    return this.requestMultipart("POST", "/v1/notes/import", formData);
  }

  importNoteFromUrl(payload) {
    this.logOperation("importNoteFromUrl", { url: payload?.url });
    return this.request("POST", "/v1/notes/import-url", { body: payload });
  }

  searchNotes(payload) {
    this.logOperation("searchNotes", { query: payload?.query, limit: payload?.limit });
    return this.request("POST", "/v1/notes/search", { body: payload });
  }

  insertBetween(activityId, payload) {
    this.logOperation("insertBetween", {
      activityId,
      title: payload?.title,
      childId: payload?.childId,
    });
    return this.request("POST", `/v1/activities/${encodeURIComponent(activityId)}/insert-between`, {
      body: payload,
    });
  }

  updateActivity(activityId, payload) {
    this.logOperation("updateActivity", { activityId, title: payload?.title });
    return this.request("PATCH", `/v1/activities/${encodeURIComponent(activityId)}`, { body: payload });
  }

  startWork(activityId) {
    this.logOperation("startWork", { activityId });
    return this.request("POST", `/v1/activities/${encodeURIComponent(activityId)}/work/start`);
  }

  stopWork(activityId) {
    this.logOperation("stopWork", { activityId });
    return this.request("POST", `/v1/activities/${encodeURIComponent(activityId)}/work/stop`);
  }

  forkActivity(activityId) {
    this.logOperation("forkActivity", { activityId });
    return this.request("POST", `/v1/activities/${encodeURIComponent(activityId)}/fork`);
  }

  deleteActivity(activityId, deleteTree = false) {
    this.logOperation("deleteActivity", { activityId, deleteTree });
    return this.request("DELETE", `/v1/activities/${encodeURIComponent(activityId)}`, {
      query: { deleteTree },
    });
  }

  replaceDependencies(activityId, parentIds) {
    this.logOperation("replaceDependencies", { activityId, parentIds });
    return this.request("PUT", `/v1/activities/${encodeURIComponent(activityId)}/dependencies`, {
      body: { parentIds },
    });
  }

  replaceSchedule(activityId, peers) {
    this.logOperation("replaceSchedule", { activityId, peers });
    return this.request("PUT", `/v1/activities/${encodeURIComponent(activityId)}/schedule`, {
      body: { peers },
    });
  }

  deleteDependency(parentId, childId) {
    this.logOperation("deleteDependency", { parentId, childId });
    return this.request(
      "DELETE",
      `/v1/dependencies/${encodeURIComponent(parentId)}/${encodeURIComponent(childId)}`,
    );
  }

  deleteSchedule(earlierId, laterId) {
    this.logOperation("deleteSchedule", { earlierId, laterId });
    return this.request(
      "DELETE",
      `/v1/schedules/${encodeURIComponent(earlierId)}/${encodeURIComponent(laterId)}`,
    );
  }

  async request(method, path, opts = {}) {
    const query = toQueryString(opts.query);
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ""}`;
    const headers = {
      ...this.defaultHeaders,
    };

    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    this.logRequest(method, url, opts.body ?? opts.query);

    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    const parsed = parseBody(text);
    if (!response.ok) {
      this.logFailure(method, url, response.status, parsed);
      throw new ApiError(response.status, parsed);
    }
    this.logResponse(method, url, response.status, parsed);
    return parsed;
  }

  async requestMultipart(method, path, formData, opts = {}) {
    const query = toQueryString(opts.query);
    const url = `${this.baseUrl}${path}${query ? `?${query}` : ""}`;
    const headers = {
      ...this.defaultHeaders,
    };
    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    this.logRequest(method, url, { multipart: true });
    const response = await this.fetchImpl(url, {
      method,
      headers,
      body: formData,
    });
    if (response.status === 204) {
      return null;
    }
    const text = await response.text();
    const parsed = parseBody(text);
    if (!response.ok) {
      this.logFailure(method, url, response.status, parsed);
      throw new ApiError(response.status, parsed);
    }
    this.logResponse(method, url, response.status, parsed);
    return parsed;
  }

  logInit() {
    const key = `${SDK_VERSION}|${this.environment}|${this.apiUrl}`;
    if (INIT_LOG_KEYS.has(key)) {
      return;
    }
    INIT_LOG_KEYS.add(key);
    console.info("[move37-sdk] init", {
      version: SDK_VERSION,
      environment: this.environment,
      apiUrl: this.apiUrl,
    });
  }

  logOperation(operation, details) {
    if (!this.localLoggingEnabled) {
      return;
    }
    console.info("[move37-sdk] operation", {
      version: SDK_VERSION,
      environment: this.environment,
      apiUrl: this.apiUrl,
      operation,
      details: summarize(details),
    });
  }

  logRequest(method, url, details) {
    if (!this.localLoggingEnabled) {
      return;
    }
    console.debug("[move37-sdk] request", {
      method,
      url: this.toAbsoluteUrl(url),
      details: summarize(details),
    });
  }

  logResponse(method, url, status, body) {
    if (!this.localLoggingEnabled) {
      return;
    }
    console.debug("[move37-sdk] response", {
      method,
      url: this.toAbsoluteUrl(url),
      status,
      body: summarize(body),
    });
  }

  logFailure(method, url, status, body) {
    console.error("[move37-sdk] request failed", {
      version: SDK_VERSION,
      environment: this.environment,
      apiUrl: this.apiUrl,
      method,
      url: this.toAbsoluteUrl(url),
      status,
      body: summarize(body),
    });
  }

  toAbsoluteUrl(url) {
    if (/^https?:\/\//i.test(url)) {
      return url;
    }
    return `${this.apiUrl}${url}`;
  }
}

function parseBody(value) {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toQueryString(input) {
  if (!input) {
    return "";
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => params.append(key, String(entry)));
      continue;
    }
    params.append(key, String(value));
  }
  return params.toString();
}

function getGlobalSet(key) {
  if (!globalThis[key]) {
    globalThis[key] = new Set();
  }
  return globalThis[key];
}

function resolveApiUrl(baseUrl) {
  if (baseUrl) {
    try {
      return new URL(baseUrl, globalThis.location?.origin || "http://localhost").toString().replace(/\/$/, "");
    } catch {
      return baseUrl;
    }
  }
  if (globalThis.location?.origin) {
    return globalThis.location.origin.replace(/\/$/, "");
  }
  return "http://localhost";
}

function inferEnvironment(apiUrl) {
  const haystack = String(apiUrl || "").toLowerCase();
  if (
    haystack.includes("localhost") ||
    haystack.includes("127.0.0.1") ||
    haystack.includes("0.0.0.0") ||
    haystack.includes(".local")
  ) {
    return "local";
  }
  if (haystack.includes("beta")) {
    return "beta";
  }
  if (haystack.includes("rc")) {
    return "rc";
  }
  if (haystack.includes("dev")) {
    return "dev";
  }
  return "stable";
}

function summarize(value) {
  if (value == null) {
    return value;
  }
  if (typeof value === "string") {
    return value.length > 180 ? `${value.slice(0, 177)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => summarize(entry));
  }
  if (typeof value !== "object") {
    return value;
  }
  const summary = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "content" && typeof entry === "string") {
      summary[key] = `<string:${entry.length}>`;
      continue;
    }
    if (key === "notes" && typeof entry === "string") {
      summary[key] = `<string:${entry.length}>`;
      continue;
    }
    summary[key] = summarize(entry);
  }
  return summary;
}

function deriveErrorMessage(status, body) {
  if (body && typeof body === "object") {
    if (typeof body.detail === "string" && body.detail.trim()) {
      return body.detail;
    }
    if (typeof body.message === "string" && body.message.trim()) {
      return body.message;
    }
    if (typeof body.error === "string" && body.error.trim()) {
      return body.error;
    }
  }
  return `Move37 API request failed with status ${status}`;
}
