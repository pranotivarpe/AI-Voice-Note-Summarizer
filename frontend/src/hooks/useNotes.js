// useNotes.js
// Persists voice note history to localStorage.

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "voiceNotes";

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function makeTitle(transcript, summary) {
  const firstPoint = summary?.key_points?.[0];
  if (firstPoint) return firstPoint.slice(0, 60);

  if (transcript) {
    const words = transcript.trim().split(/\s+/).slice(0, 8).join(" ");
    return words.length < transcript.trim().length ? `${words}…` : words;
  }

  return "Untitled note";
}

export function useNotes() {
  const [notes, setNotes] = useState(loadNotes);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  const saveNote = useCallback(({ transcript, summary, audioFileName, mode, category }) => {
    const note = {
      id:
        typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title: makeTitle(transcript, summary),
      transcript,
      summary,
      audioFileName,
      mode: mode || "general",
      category: category || "general",
      pinned: false,
      checkedItems: [],
      createdAt: new Date().toISOString(),
    };
    setNotes((prev) => [note, ...prev]);
    return note;
  }, []);

  const updateNote = useCallback((id, changes) => {
    setNotes((prev) =>
      prev.map((note) => (note.id === id ? { ...note, ...changes } : note))
    );
  }, []);

  const deleteNote = useCallback((id) => {
    setNotes((prev) => prev.filter((note) => note.id !== id));
  }, []);

  return { notes, saveNote, updateNote, deleteNote };
}
