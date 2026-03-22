import { describe, expect, it, vi } from "vitest";

import { ApiError, Move37Client } from "./client";

describe("Move37Client", () => {
  it("builds authenticated graph requests", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ graphId: 1, version: 1, nodes: [], dependencies: [], schedules: [] }),
    }));
    const client = new Move37Client({
      baseUrl: "http://localhost:8080",
      token: "token-123",
      fetchImpl,
    });

    await client.getGraph();

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8080/v1/graph",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
        }),
      }),
    );
  });

  it("throws ApiError for non-success responses", async () => {
    const client = new Move37Client({
      baseUrl: "",
      fetchImpl: async () => ({
        ok: false,
        status: 409,
        text: async () => JSON.stringify({ detail: "boom" }),
      }),
    });

    await expect(client.getGraph()).rejects.toBeInstanceOf(ApiError);
  });

  it("posts URL note imports as JSON", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ notes: [], graph: { graphId: 1, version: 1, nodes: [], dependencies: [], schedules: [] } }),
    }));
    const client = new Move37Client({
      baseUrl: "http://localhost:8080",
      token: "token-123",
      fetchImpl,
    });

    await client.importNoteFromUrl({ url: "https://example.com/reference.txt" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8080/v1/notes/import-url",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ url: "https://example.com/reference.txt" }),
      }),
    );
  });

  it("requests Apple Calendar events with range params", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ events: [] }),
    }));
    const client = new Move37Client({
      baseUrl: "http://localhost:8080",
      token: "token-123",
      fetchImpl,
    });

    await client.listAppleCalendarEvents({
      start: "2026-03-17T00:00:00Z",
      end: "2026-03-24T00:00:00Z",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8080/v1/calendars/apple/events?start=2026-03-17T00%3A00%3A00Z&end=2026-03-24T00%3A00%3A00Z",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
        }),
      }),
    );
  });

  it("posts scheduling replans as JSON", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        status: "ok",
        summary: { movedTasks: 1, conflicts: 0, unscheduled: 0, projectsAffected: 1 },
        changes: [],
        conflicts: [],
        unscheduled: [],
        projectImpacts: [],
        runMetadata: {
          engine: "move37-deterministic",
          engineVersion: "0.1",
          runMode: "dry_run",
          computedAt: "2026-03-22T12:00:00+00:00",
          applied: false,
        },
      }),
    }));
    const client = new Move37Client({
      baseUrl: "http://localhost:8080",
      token: "token-123",
      fetchImpl,
    });

    await client.replanSchedule({ mode: "dry_run", parameters: {} });

    expect(fetchImpl).toHaveBeenCalledWith(
      "http://localhost:8080/v1/scheduling/replan",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer token-123",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify({ mode: "dry_run", parameters: {} }),
      }),
    );
  });
});
