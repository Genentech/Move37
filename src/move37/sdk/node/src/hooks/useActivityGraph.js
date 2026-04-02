import { useEffect, useMemo, useState } from "react";

import { Move37Client } from "../client";

export function useActivityGraph(options) {
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
  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const nextGraph = await client.getGraph();
      setGraph(nextGraph);
      return nextGraph;
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

  async function runStructuralMutation(action) {
    setMutating(true);
    setError(null);
    try {
      const nextGraph = await action();
      setGraph(nextGraph);
      return nextGraph;
    } catch (nextError) {
      const wrapped = nextError instanceof Error ? nextError : new Error(String(nextError));
      setError(wrapped);
      throw wrapped;
    } finally {
      setMutating(false);
    }
  }

  async function runNodeMutation(activityId, optimisticUpdater, action) {
    setMutating(true);
    setError(null);
    const previousGraph = graph;
    if (optimisticUpdater) {
      setGraph((current) => (current ? optimisticUpdater(current) : current));
    }
    try {
      const node = await action();
      setGraph((current) => patchGraphNode(current, activityId, node));
      return node;
    } catch (nextError) {
      setGraph(previousGraph);
      const wrapped = nextError instanceof Error ? nextError : new Error(String(nextError));
      setError(wrapped);
      throw wrapped;
    } finally {
      setMutating(false);
    }
  }

  return {
    graph,
    loading,
    mutating,
    error,
    reload,
    createActivity: (payload) => runStructuralMutation(() => client.createActivity(payload)),
    insertBetween: (activityId, payload) =>
      runStructuralMutation(() => client.insertBetween(activityId, payload)),
    updateActivity: (activityId, payload, optimisticUpdater = null) =>
      runNodeMutation(
        activityId,
        optimisticUpdater,
        () => client.updateActivity(activityId, payload),
      ),
    startWork: (activityId, optimisticUpdater = null) =>
      runNodeMutation(activityId, optimisticUpdater, () => client.startWork(activityId)),
    stopWork: (activityId, optimisticUpdater = null) =>
      runNodeMutation(activityId, optimisticUpdater, () => client.stopWork(activityId)),
    forkActivity: (activityId) => runStructuralMutation(() => client.forkActivity(activityId)),
    deleteActivity: (activityId, deleteTree = false) =>
      runStructuralMutation(() => client.deleteActivity(activityId, deleteTree)),
    replaceDependencies: (activityId, parentIds) =>
      runStructuralMutation(() => client.replaceDependencies(activityId, parentIds)),
    deleteDependency: (parentId, childId) =>
      runStructuralMutation(() => client.deleteDependency(parentId, childId)),
  };
}

function patchGraphNode(current, activityId, node) {
  if (!current) {
    return current;
  }
  return {
    ...current,
    nodes: current.nodes.map((entry) => (entry.id === activityId ? { ...entry, ...node } : entry)),
  };
}
