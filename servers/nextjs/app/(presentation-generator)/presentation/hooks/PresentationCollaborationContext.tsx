"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CollaborationState } from "./usePresentationCollaboration";

const noopCollaboration: CollaborationState = {
  snapshot: null,
  currentHolder: null,
  canEditCurrent: true,
  canChangeStructure: true,
  structureHolder: undefined,
  editors: [],
  acquireStructure: async () => true,
  releaseStructure: async () => undefined,
  runStructureChange: async (fn) => {
    await fn();
    return true;
  },
  holderForSlide: () => null,
  presenceForSlide: () => null,
};

const PresentationCollaborationContext =
  createContext<CollaborationState>(noopCollaboration);

export function PresentationCollaborationProvider({
  value,
  children,
}: {
  value: CollaborationState;
  children: ReactNode;
}) {
  return (
    <PresentationCollaborationContext.Provider value={value}>
      {children}
    </PresentationCollaborationContext.Provider>
  );
}

export function useCollaboration(): CollaborationState {
  return useContext(PresentationCollaborationContext);
}
