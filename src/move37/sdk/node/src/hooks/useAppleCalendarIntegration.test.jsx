// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useAppleCalendarIntegration } from "./useAppleCalendarIntegration";

function createJsonResponse(body) {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  };
}

describe("useAppleCalendarIntegration", () => {
  it("loads status and supports connecting", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          enabled: true,
          connected: false,
          provider: "apple",
          writableCalendarId: null,
          ownerEmail: null,
          baseUrl: null,
          calendars: [],
        }),
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          enabled: true,
          connected: true,
          provider: "apple",
          writableCalendarId: "https://calendar.test/caldav/work/",
          ownerEmail: "user@example.com",
          baseUrl: "https://calendar.test",
          calendars: [
            { id: "https://calendar.test/caldav/work/", name: "work", readOnly: false },
          ],
        }),
      );

    const { result } = renderHook(() =>
      useAppleCalendarIntegration({
        baseUrl: "",
        token: "token",
        fetchImpl,
      }),
    );

    await waitFor(() => expect(result.current.status).not.toBeNull());
    expect(result.current.status.connected).toBe(false);

    await result.current.connect({
      username: "user@example.com",
      password: "app-password",
      baseUrl: "https://calendar.test",
    });

    expect(result.current.status.connected).toBe(true);
    expect(result.current.status.ownerEmail).toBe("user@example.com");
  });
});
