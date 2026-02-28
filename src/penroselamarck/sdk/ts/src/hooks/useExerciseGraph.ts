import { useCallback, useEffect, useMemo, useState } from "react";

import { PenroseLamarckClient, type PenroseLamarckClientOptions } from "../client";
import type { ExerciseGraphOutput } from "../types";

export interface UseExerciseGraphOptions extends PenroseLamarckClientOptions {
  language?: string;
  enabled?: boolean;
}

export interface UseExerciseGraphResult {
  data: ExerciseGraphOutput | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

export function useExerciseGraph(options: UseExerciseGraphOptions): UseExerciseGraphResult {
  const { enabled = true, language } = options;
  const headersKey = JSON.stringify(options.defaultHeaders ?? {});
  const client = useMemo(
    () =>
      new PenroseLamarckClient({
        baseUrl: options.baseUrl,
        token: options.token,
        defaultHeaders: options.defaultHeaders,
        fetchImpl: options.fetchImpl,
      }),
    [options.baseUrl, options.token, options.fetchImpl, headersKey]
  );
  const [data, setData] = useState<ExerciseGraphOutput | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await client.getExerciseGraph(language);
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [client, enabled, language]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
