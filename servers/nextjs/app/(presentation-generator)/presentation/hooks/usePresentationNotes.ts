"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { notify } from "@/components/ui/sonner";
import {
  NotesApi,
  notesForSlide,
  unresolvedNoteCount,
  type PresentationNote,
} from "../../services/api/notes";

const POLL_MS = 4000;

export type NotesState = {
  notes: PresentationNote[];
  visible: boolean;
  placing: boolean;
  selectedId: string | null;
  draft: { x: number; y: number } | null;
  canWrite: boolean;
  unresolvedTotal: number;
  notesOnSlide: PresentationNote[];
  unresolvedOnSlide: number;
  countForSlide: (slideId: string | null | undefined) => number;
  setVisible: (visible: boolean) => void;
  toggleVisible: () => void;
  startPlacing: () => void;
  cancelPlacing: () => void;
  selectNote: (noteId: string | null) => void;
  placeDraft: (x: number, y: number) => void;
  createNote: (body: string, x?: number, y?: number) => Promise<boolean>;
  replyToNote: (noteId: string, body: string) => Promise<boolean>;
  resolveNote: (noteId: string, resolved: boolean) => Promise<boolean>;
  deleteNote: (noteId: string) => Promise<boolean>;
};

export function usePresentationNotes({
  presentationId,
  slideId,
  enabled = true,
  canWrite = true,
}: {
  presentationId?: string | null;
  slideId?: string | null;
  enabled?: boolean;
  canWrite?: boolean;
}): NotesState {
  const [notes, setNotes] = useState<PresentationNote[]>([]);
  const [visible, setVisible] = useState(true);
  const [placing, setPlacing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ x: number; y: number } | null>(null);

  const refresh = useCallback(async () => {
    if (!presentationId || !enabled) return;
    try {
      const next = await NotesApi.list(presentationId);
      setNotes(Array.isArray(next) ? next : []);
    } catch {
      // Keep the last successful snapshot; the next poll retries.
    }
  }, [enabled, presentationId]);

  useEffect(() => {
    if (!presentationId || !enabled) {
      setNotes([]);
      setPlacing(false);
      setDraft(null);
      return;
    }
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, presentationId, refresh]);

  const notesOnSlide = useMemo(
    () => notesForSlide(notes, slideId),
    [notes, slideId],
  );

  const countForSlide = useCallback(
    (id: string | null | undefined) =>
      unresolvedNoteCount(notesForSlide(notes, id)),
    [notes],
  );

  const startPlacing = useCallback(() => {
    if (!canWrite) return;
    setVisible(true);
    setPlacing(true);
    setSelectedId(null);
    setDraft(null);
  }, [canWrite]);

  const cancelPlacing = useCallback(() => {
    setPlacing(false);
    setDraft(null);
  }, []);

  const placeDraft = useCallback(
    (x: number, y: number) => {
      if (!canWrite) return;
      setDraft({ x, y });
      setPlacing(false);
      setSelectedId(null);
      setVisible(true);
    },
    [canWrite],
  );

  const createNote = useCallback(
    async (body: string, x?: number, y?: number) => {
      if (!presentationId || !slideId || !canWrite) return false;
      try {
        const created = await NotesApi.create(presentationId, {
          slide_id: slideId,
          body,
          x: x ?? draft?.x ?? null,
          y: y ?? draft?.y ?? null,
        });
        setNotes((current) => {
          const without = current.filter((note) => note.id !== created.id);
          return [...without, { ...created, replies: created.replies ?? [] }];
        });
        setDraft(null);
        setPlacing(false);
        setSelectedId(created.id);
        void refresh();
        return true;
      } catch (error) {
        notify.error(
          "Could not add note",
          error instanceof Error ? error.message : undefined,
        );
        return false;
      }
    },
    [canWrite, draft?.x, draft?.y, presentationId, refresh, slideId],
  );

  const replyToNote = useCallback(
    async (noteId: string, body: string) => {
      if (!presentationId || !canWrite) return false;
      try {
        await NotesApi.reply(presentationId, noteId, body);
        void refresh();
        setSelectedId(noteId);
        return true;
      } catch (error) {
        notify.error(
          "Could not reply",
          error instanceof Error ? error.message : undefined,
        );
        return false;
      }
    },
    [canWrite, presentationId, refresh],
  );

  const resolveNote = useCallback(
    async (noteId: string, resolved: boolean) => {
      if (!presentationId || !canWrite) return false;
      try {
        await NotesApi.update(presentationId, noteId, { resolved });
        void refresh();
        return true;
      } catch (error) {
        notify.error(
          "Could not update note",
          error instanceof Error ? error.message : undefined,
        );
        return false;
      }
    },
    [canWrite, presentationId, refresh],
  );

  const deleteNote = useCallback(
    async (noteId: string) => {
      if (!presentationId) return false;
      try {
        await NotesApi.remove(presentationId, noteId);
        setNotes((current) =>
          current.filter((note) => note.id !== noteId && note.parent_id !== noteId),
        );
        if (selectedId === noteId) setSelectedId(null);
        void refresh();
        return true;
      } catch (error) {
        notify.error(
          "Could not delete note",
          error instanceof Error ? error.message : undefined,
        );
        return false;
      }
    },
    [presentationId, refresh, selectedId],
  );

  return {
    notes,
    visible,
    placing,
    selectedId,
    draft,
    canWrite,
    unresolvedTotal: unresolvedNoteCount(notes),
    notesOnSlide,
    unresolvedOnSlide: unresolvedNoteCount(notesOnSlide),
    countForSlide,
    setVisible,
    toggleVisible: () => setVisible((current) => !current),
    startPlacing,
    cancelPlacing,
    selectNote: setSelectedId,
    placeDraft,
    createNote,
    replyToNote,
    resolveNote,
    deleteNote,
  };
}
