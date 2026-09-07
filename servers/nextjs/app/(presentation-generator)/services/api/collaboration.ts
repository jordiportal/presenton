import { getApiUrl } from "@/utils/api";
import { getHeader } from "./header";
import { ApiResponseHandler } from "./api-error-handler";

export type CollaborationLease = {
  id: string;
  scope: string;
  holder_type: string;
  holder_id: string | null;
  holder_name: string;
  session_id: string;
  mine: boolean;
  expires_at: string;
};

export type CollaborationPresence = {
  holder_type: string;
  holder_id: string | null;
  holder_name: string;
  session_id: string;
  slide_index: number | null;
  slide_id: string | null;
  mine: boolean;
  expires_at: string;
};

export type CollaborationSnapshot = {
  leases: CollaborationLease[];
  presence: CollaborationPresence[];
  conflicts?: Array<{
    code?: string;
    scope?: string;
    holder_name?: string;
    message?: string;
  }>;
};

export function collaborationHolderLabel(
  holder: { holder_name?: string | null } | null | undefined,
): string {
  const name = holder?.holder_name?.trim();
  if (!name || name === "local") return "Another tab";
  return name;
}

export function collaborationHolderInitial(
  holder: { holder_name?: string | null } | null | undefined,
): string {
  return collaborationHolderLabel(holder).slice(0, 1).toUpperCase();
}

export function isConflictError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "status" in error &&
      (error as { status?: number }).status === 409,
  );
}

export class CollaborationApi {
  static async getSnapshot(presentationId: string): Promise<CollaborationSnapshot> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/presentation/${presentationId}/collaboration`),
      { headers: getHeader(), cache: "no-cache" },
    );
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to load collaboration state",
    );
  }

  static async sync(
    presentationId: string,
    payload: {
      slide_index?: number | null;
      slide_id?: string | null;
      acquire_slide?: boolean;
      acquire_structure?: boolean;
      release_scopes?: string[];
      holder_type?: "user" | "agent";
    },
  ): Promise<CollaborationSnapshot> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/presentation/${presentationId}/collaboration/sync`),
      {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify(payload),
        cache: "no-cache",
      },
    );
    return ApiResponseHandler.handleResponse(
      response,
      "Failed to sync collaboration state",
    );
  }
}

export function slideLeaseScope(slideId: string): string {
  return `slide:${slideId}`;
}

export const STRUCTURE_SCOPE = "deck:structure";

export function holderForSlide(
  snapshot: CollaborationSnapshot | null,
  slideId: string | null | undefined,
): CollaborationLease | null {
  if (!snapshot || !slideId) return null;
  return (
    snapshot.leases.find(
      (item) => item.scope === slideLeaseScope(slideId) && !item.mine,
    ) ?? null
  );
}

export function presenceForSlide(
  snapshot: CollaborationSnapshot | null,
  slideId: string | null | undefined,
): CollaborationLease | CollaborationPresence | null {
  const lease = holderForSlide(snapshot, slideId);
  if (lease) return lease;
  if (!snapshot || !slideId) return null;
  return (
    snapshot.presence.find(
      (item) => item.slide_id === slideId && !item.mine,
    ) ?? null
  );
}
