// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useSchedulingReplan } from "./useSchedulingReplan";

function createJsonResponse(body) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

describe("useSchedulingReplan", () => {
  it("submits a dry run and stores the result", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      createJsonResponse({
        status: "ok",
        summary: { movedTasks: 2, conflicts: 0, unscheduled: 1, projectsAffected: 1 },
        changes: [
          {
            activityId: "wake-early",
            title: "Wake early",
            previousStartsAt: "2026-03-22T09:00:00+00:00",
            proposedStartsAt: "2026-03-23T09:00:00+00:00",
            deltaMinutes: 1440,
            branchRootId: "wake-early",
          },
        ],
        conflicts: [],
        unscheduled: [
          {
            activityId: "buy-shoes",
            title: "Buy shoes",
            code: "missing_duration",
            message: "Expected time is required before this task can be scheduled.",
          },
        ],
        projectImpacts: [],
        runMetadata: {
          engine: "move37-deterministic",
          engineVersion: "0.1",
          runMode: "dry_run",
          computedAt: "2026-03-22T12:00:00+00:00",
          applied: false,
        },
      }),
    );

    const { result } = renderHook(() =>
      useSchedulingReplan({
        baseUrl: "",
        token: "token",
        fetchImpl,
      }),
    );

    await result.current.run({ mode: "dry_run", parameters: {} });

    await waitFor(() => expect(result.current.result).not.toBeNull());
    expect(result.current.result.summary.movedTasks).toBe(2);
    expect(result.current.result.runMetadata.applied).toBe(false);
  });
});
