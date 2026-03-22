import { useEffect, useMemo, useState } from "react";

import { Move37Client } from "../client";

export function useAppleCalendarIntegration(options) {
  const headersKey = JSON.stringify(options.defaultHeaders ?? {});
  const client = useMemo(
    () =>
      new Move37Client({
        baseUrl: options.baseUrl,
        token: options.token,
        defaultHeaders: options.defaultHeaders,
        fetchImpl: options.fetchImpl,
      }),
    [options.baseUrl, options.fetchImpl, options.token, headersKey],
  );
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await client.getAppleIntegrationStatus();
      setStatus(nextStatus);
      return nextStatus;
    } catch (nextError) {
      const wrapped = nextError instanceof Error ? nextError : new Error(String(nextError));
      setError(wrapped);
      throw wrapped;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [client]);

  async function runMutation(action) {
    setMutating(true);
    setError(null);
    try {
      const nextStatus = await action();
      setStatus(nextStatus);
      return nextStatus;
    } catch (nextError) {
      const wrapped = nextError instanceof Error ? nextError : new Error(String(nextError));
      setError(wrapped);
      throw wrapped;
    } finally {
      setMutating(false);
    }
  }

  return {
    status,
    loading,
    mutating,
    error,
    reload,
    connect: (payload) => runMutation(() => client.connectAppleCalendar(payload)),
    disconnect: () => runMutation(() => client.disconnectAppleCalendar()),
    updatePreferences: (payload) => runMutation(() => client.updateAppleCalendarPreferences(payload)),
  };
}
