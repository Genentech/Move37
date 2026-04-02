// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useActivityGraph } from "./useActivityGraph";

function createJsonResponse(body) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

describe("useActivityGraph", () => {
  it("loads the graph on mount", async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({
        graphId: 1,
        version: 1,
        nodes: [{ id: "wake-early", title: "Wake", notes: "", startDate: "", bestBefore: "", expectedTime: 1, realTime: 0, expectedEffort: null, realEffort: null, workStartedAt: null }],
        dependencies: [],
        schedules: [],
      }),
    );

    const { result } = renderHook(() =>
      useActivityGraph({ baseUrl: "", token: "token", fetchImpl }),
    );

    await waitFor(() => expect(result.current.graph).not.toBeNull());
    expect(result.current.graph.nodes).toHaveLength(1);
  });

  it("does not expose replaceSchedule or deleteSchedule", async () => {
    const fetchImpl = vi.fn(async () =>
      createJsonResponse({
        graphId: 1,
        version: 1,
        nodes: [],
        dependencies: [],
        schedules: [],
      }),
    );

    const { result } = renderHook(() =>
      useActivityGraph({ baseUrl: "", token: "token", fetchImpl }),
    );

    await waitFor(() => expect(result.current.graph).not.toBeNull());
    expect(result.current.replaceSchedule).toBeUndefined();
    expect(result.current.deleteSchedule).toBeUndefined();
  });

  it("replaces the graph after a structural mutation", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          graphId: 1,
          version: 1,
          nodes: [],
          dependencies: [],
          schedules: [],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          graphId: 1,
          version: 2,
          nodes: [{ id: "new-activity", title: "New activity", notes: "", startDate: "", bestBefore: "", expectedTime: 1, realTime: 0, expectedEffort: null, realEffort: null, workStartedAt: null }],
          dependencies: [],
          schedules: [],
        }),
      );

    const { result } = renderHook(() =>
      useActivityGraph({ baseUrl: "", token: "token", fetchImpl }),
    );

    await waitFor(() => expect(result.current.graph).not.toBeNull());

    await act(async () => {
      await result.current.createActivity({
        title: "New activity",
        notes: "",
        startDate: "",
        bestBefore: "",
        expectedTime: 1,
        realTime: 0,
        expectedEffort: null,
        realEffort: null,
      });
    });

    expect(result.current.graph.nodes[0].id).toBe("new-activity");
  });
});
