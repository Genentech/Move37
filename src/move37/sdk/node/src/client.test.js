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
});
