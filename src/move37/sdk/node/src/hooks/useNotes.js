import { useEffect, useMemo, useState } from "react";

import { Move37Client } from "../client";

export function useNotes(options) {
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
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const payload = await client.listNotes();
      setNotes(payload.notes || []);
      return payload.notes || [];
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
      const result = await action();
      if (result.note) {
        setNotes((current) => {
          const next = current.filter((entry) => entry.id !== result.note.id);
          return [result.note, ...next];
        });
      } else if (result.notes) {
        setNotes((current) => [...result.notes, ...current]);
      }
      return result;
    } catch (nextError) {
      const wrapped = nextError instanceof Error ? nextError : new Error(String(nextError));
      setError(wrapped);
      throw wrapped;
    } finally {
      setMutating(false);
    }
  }

  return {
    notes,
    loading,
    mutating,
    error,
    reload,
    getNote: (noteId) => client.getNote(noteId),
    createNote: (payload) => runMutation(() => client.createNote(payload)),
    updateNote: (noteId, payload) => runMutation(() => client.updateNote(noteId, payload)),
    importTxtNotes: (formData) => runMutation(() => client.importTxtNotes(formData)),
    importNoteFromUrl: (payload) => runMutation(() => client.importNoteFromUrl(payload)),
    searchNotes: (payload) => client.searchNotes(payload),
  };
}
