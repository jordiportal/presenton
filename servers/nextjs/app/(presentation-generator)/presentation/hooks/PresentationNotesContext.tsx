"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { NotesState } from "./usePresentationNotes";

const noopNotes: NotesState = {
  notes: [],
  visible: false,
  placing: false,
  selectedId: null,
  draft: null,
  canWrite: false,
  unresolvedTotal: 0,
  notesOnSlide: [],
  unresolvedOnSlide: 0,
  countForSlide: () => 0,
  setVisible: () => undefined,
  toggleVisible: () => undefined,
  startPlacing: () => undefined,
  cancelPlacing: () => undefined,
  selectNote: () => undefined,
  placeDraft: () => undefined,
  createNote: async () => false,
  replyToNote: async () => false,
  resolveNote: async () => false,
  deleteNote: async () => false,
};

const PresentationNotesContext = createContext<NotesState>(noopNotes);

export function PresentationNotesProvider({
  value,
  children,
}: {
  value: NotesState;
  children: ReactNode;
}) {
  return (
    <PresentationNotesContext.Provider value={value}>
      {children}
    </PresentationNotesContext.Provider>
  );
}

export function useNotes(): NotesState {
  return useContext(PresentationNotesContext);
}
