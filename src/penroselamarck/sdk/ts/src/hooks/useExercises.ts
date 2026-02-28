import { useMemo, useState } from "react";

import { PenroseLamarckClient, type PenroseLamarckClientOptions } from "../client";
import type { ExerciseCreateInput, ExerciseListFilters, ExerciseListItem } from "../types";

export interface UseExercisesResult {
  items: ExerciseListItem[];
  loading: boolean;
  error: Error | null;
  list: (filters?: ExerciseListFilters) => Promise<ExerciseListItem[]>;
  create: (payload: ExerciseCreateInput) => Promise<ExerciseListItem>;
}

export function useExercises(options: PenroseLamarckClientOptions): UseExercisesResult {
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
  const [items, setItems] = useState<ExerciseListItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const list = async (filters: ExerciseListFilters = {}): Promise<ExerciseListItem[]> => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.listExercises(filters);
      setItems(response);
      return response;
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setError(wrapped);
      throw wrapped;
    } finally {
      setLoading(false);
    }
  };

  const create = async (payload: ExerciseCreateInput): Promise<ExerciseListItem> => {
    setLoading(true);
    setError(null);
    try {
      const response = await client.createExercise(payload);
      setItems((current: ExerciseListItem[]) => [response, ...current]);
      return response;
    } catch (err) {
      const wrapped = err instanceof Error ? err : new Error(String(err));
      setError(wrapped);
      throw wrapped;
    } finally {
      setLoading(false);
    }
  };

  return { items, loading, error, list, create };
}
