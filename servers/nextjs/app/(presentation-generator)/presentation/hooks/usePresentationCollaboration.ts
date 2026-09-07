"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { notify } from "@/components/ui/sonner";
import {
  CollaborationApi,
  STRUCTURE_SCOPE,
  collaborationHolderLabel,
  holderForSlide,
  presenceForSlide,
  slideLeaseScope,
  type CollaborationLease,
  type CollaborationPresence,
  type CollaborationSnapshot,
} from "../../services/api/collaboration";

const HEARTBEAT_MS = 15000;
const POLL_MS = 3000;
const STRUCTURE_RELEASE_MS = 8000;

export type CollaborationState = {
  snapshot: CollaborationSnapshot | null;
  currentHolder: CollaborationLease | CollaborationPresence | null;
  canEditCurrent: boolean;
  canChangeStructure: boolean;
  structureHolder: CollaborationLease | undefined;
  editors: CollaborationPresence[];
  acquireStructure: () => Promise<boolean>;
  releaseStructure: () => Promise<void>;
  runStructureChange: (fn: () => void | Promise<void>) => Promise<boolean>;
  holderForSlide: (
    id: string | null | undefined,
  ) => CollaborationLease | null;
  presenceForSlide: (
    id: string | null | undefined,
  ) => CollaborationLease | CollaborationPresence | null;
};

export function usePresentationCollaboration({
  presentationId,
  slideId,
  slideIndex,
  enabled = true,
  canWrite = true,
}: {
  presentationId?: string | null;
  slideId?: string | null;
  slideIndex?: number | null;
  enabled?: boolean;
  canWrite?: boolean;
}): CollaborationState {
  const [snapshot, setSnapshot] = useState<CollaborationSnapshot | null>(null);
  const previousSlideScopeRef = useRef<string | null>(null);
  const slideIdRef = useRef(slideId);
  const slideIndexRef = useRef(slideIndex);
  const holdingStructureRef = useRef(false);
  const structureReleaseTimerRef = useRef<number | null>(null);
  slideIdRef.current = slideId;
  slideIndexRef.current = slideIndex;

  const applySnapshot = useCallback((next: CollaborationSnapshot) => {
    setSnapshot(next);
  }, []);

  const sync = useCallback(
    async (overrides?: {
      acquire_slide?: boolean;
      acquire_structure?: boolean;
      release_scopes?: string[];
      slide_id?: string | null;
      slide_index?: number | null;
    }) => {
      if (!presentationId || !enabled) return null;
      const next = await CollaborationApi.sync(presentationId, {
        slide_id: overrides?.slide_id ?? slideIdRef.current,
        slide_index: overrides?.slide_index ?? slideIndexRef.current,
        acquire_slide:
          (overrides?.acquire_slide ?? Boolean(slideIdRef.current)) && canWrite,
        acquire_structure:
          (overrides?.acquire_structure ?? holdingStructureRef.current) &&
          canWrite,
        release_scopes: overrides?.release_scopes,
      });
      applySnapshot(next);
      return next;
    },
    [applySnapshot, canWrite, enabled, presentationId],
  );

  useEffect(() => {
    if (!presentationId || !enabled) return;

    let cancelled = false;
    const nextScope = slideId ? slideLeaseScope(slideId) : null;
    const previousScope = previousSlideScopeRef.current;
    const releaseScopes =
      previousScope && previousScope !== nextScope ? [previousScope] : [];

    void sync({
      acquire_slide: Boolean(slideId) && canWrite,
      release_scopes: releaseScopes,
    })
      .then(() => {
        if (!cancelled) previousSlideScopeRef.current = nextScope;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [enabled, presentationId, slideId, slideIndex, sync]);

  useEffect(() => {
    if (!presentationId || !enabled) return;

    const heartbeat = window.setInterval(() => {
      void sync().catch(() => undefined);
    }, HEARTBEAT_MS);
    const poll = window.setInterval(() => {
      void CollaborationApi.getSnapshot(presentationId)
        .then(applySnapshot)
        .catch(() => undefined);
    }, POLL_MS);

    const releaseAll = () => {
      const scopes = [
        previousSlideScopeRef.current,
        holdingStructureRef.current ? STRUCTURE_SCOPE : null,
      ].filter((scope): scope is string => Boolean(scope));
      holdingStructureRef.current = false;
      if (scopes.length === 0) return;
      void CollaborationApi.sync(presentationId, {
        acquire_slide: false,
        acquire_structure: false,
        release_scopes: scopes,
      }).catch(() => undefined);
    };

    window.addEventListener("pagehide", releaseAll);
    return () => {
      window.clearInterval(heartbeat);
      window.clearInterval(poll);
      window.removeEventListener("pagehide", releaseAll);
      if (structureReleaseTimerRef.current) {
        window.clearTimeout(structureReleaseTimerRef.current);
        structureReleaseTimerRef.current = null;
      }
      releaseAll();
    };
  }, [applySnapshot, enabled, presentationId, sync]);

  const currentHolder = useMemo(
    () => holderForSlide(snapshot, slideId),
    [slideId, snapshot],
  );
  const canEditCurrent = canWrite && !currentHolder;
  const structureHolder = snapshot?.leases.find(
    (lease) => lease.scope === STRUCTURE_SCOPE && !lease.mine,
  );
  const canChangeStructure = canWrite && !structureHolder;
  const editors = useMemo(
    () => (snapshot?.presence ?? []).filter((item) => !item.mine),
    [snapshot],
  );

  const acquireStructure = useCallback(async () => {
    if (!canWrite) return false;
    holdingStructureRef.current = true;
    try {
      const next = await sync({ acquire_structure: true });
      const blocked = next?.leases.some(
        (lease) => lease.scope === STRUCTURE_SCOPE && !lease.mine,
      );
      if (blocked) {
        holdingStructureRef.current = false;
        return false;
      }
      return true;
    } catch {
      holdingStructureRef.current = false;
      return false;
    }
  }, [sync]);

  const releaseStructure = useCallback(async () => {
    holdingStructureRef.current = false;
    if (structureReleaseTimerRef.current) {
      window.clearTimeout(structureReleaseTimerRef.current);
      structureReleaseTimerRef.current = null;
    }
    try {
      await sync({
        acquire_structure: false,
        release_scopes: [STRUCTURE_SCOPE],
      });
    } catch {
      // Presence sync can fail on unload; the lease expires on its own.
    }
  }, [sync]);

  const runStructureChange = useCallback(
    async (fn: () => void | Promise<void>) => {
      const ok = await acquireStructure();
      if (!ok) {
        notify.error(
          "Deck structure is locked",
          `${collaborationHolderLabel(structureHolder)} is adding or reordering slides.`,
        );
        return false;
      }
      try {
        await fn();
      } catch (error) {
        await releaseStructure();
        throw error;
      }
      if (structureReleaseTimerRef.current) {
        window.clearTimeout(structureReleaseTimerRef.current);
      }
      structureReleaseTimerRef.current = window.setTimeout(() => {
        void releaseStructure();
      }, STRUCTURE_RELEASE_MS);
      return true;
    },
    [acquireStructure, releaseStructure, structureHolder],
  );

  return {
    snapshot,
    currentHolder,
    canEditCurrent,
    canChangeStructure,
    structureHolder,
    editors,
    acquireStructure,
    releaseStructure,
    runStructureChange,
    holderForSlide: (id: string | null | undefined) =>
      holderForSlide(snapshot, id),
    presenceForSlide: (id: string | null | undefined) =>
      presenceForSlide(snapshot, id),
  };
}
