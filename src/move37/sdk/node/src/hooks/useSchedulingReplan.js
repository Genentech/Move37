import { useMemo, useState } from "react";

import { Move37Client } from "../client";

export function useSchedulingReplan(options) {
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
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function run(payload) {
    setLoading(true);
    setError(null);
    try {
      const nextResult = await client.replanSchedule(payload);
      setResult(nextResult);
      return nextResult;
    } catch (nextError) {
      const wrapped = nextError instanceof Error ? nextError : new Error(String(nextError));
      setError(wrapped);
      throw wrapped;
    } finally {
      setLoading(false);
    }
  }

  function clear() {
    setResult(null);
    setError(null);
  }

  return {
    loading,
    result,
    error,
    run,
    clear,
  };
}
