import { getApiUrl } from "@/utils/api";
import { getHeader } from "./header";
import { ApiResponseHandler } from "./api-error-handler";

export type PresentationNote = {
  id: string;
  presentation_id: string;
  slide_id: string;
  parent_id: string | null;
  author_user_id: string | null;
  author_username: string;
  body: string;
  x: number | null;
  y: number | null;
  resolved: boolean;
  created_at: string;
  updated_at: string;
  mine: boolean;
  can_delete: boolean;
  replies: PresentationNote[];
};

export class NotesApi {
  static async list(
    presentationId: string,
    slideId?: string | null,
  ): Promise<PresentationNote[]> {
    const query = slideId ? `?slide_id=${encodeURIComponent(slideId)}` : "";
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/presentation/${presentationId}/notes${query}`),
      { headers: getHeader(), cache: "no-cache" },
    );
    return ApiResponseHandler.handleResponse(response, "Failed to load notes");
  }

  static async create(
    presentationId: string,
    payload: {
      slide_id: string;
      body: string;
      x?: number | null;
      y?: number | null;
      parent_id?: string | null;
    },
  ): Promise<PresentationNote> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/presentation/${presentationId}/notes`),
      {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify(payload),
        cache: "no-cache",
      },
    );
    return ApiResponseHandler.handleResponse(response, "Failed to add note");
  }

  static async reply(
    presentationId: string,
    noteId: string,
    body: string,
  ): Promise<PresentationNote> {
    const response = await fetch(
      getApiUrl(
        `/api/v1/ppt/presentation/${presentationId}/notes/${noteId}/replies`,
      ),
      {
        method: "POST",
        headers: getHeader(),
        body: JSON.stringify({ body }),
        cache: "no-cache",
      },
    );
    return ApiResponseHandler.handleResponse(response, "Failed to reply");
  }

  static async update(
    presentationId: string,
    noteId: string,
    payload: { body?: string; resolved?: boolean },
  ): Promise<PresentationNote> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/presentation/${presentationId}/notes/${noteId}`),
      {
        method: "PATCH",
        headers: getHeader(),
        body: JSON.stringify(payload),
        cache: "no-cache",
      },
    );
    return ApiResponseHandler.handleResponse(response, "Failed to update note");
  }

  static async remove(presentationId: string, noteId: string): Promise<void> {
    const response = await fetch(
      getApiUrl(`/api/v1/ppt/presentation/${presentationId}/notes/${noteId}`),
      { method: "DELETE", headers: getHeader(), cache: "no-cache" },
    );
    await ApiResponseHandler.handleResponse(response, "Failed to delete note");
  }
}

export function unresolvedNoteCount(notes: PresentationNote[]): number {
  return notes.filter((note) => !note.resolved).length;
}

export function notesForSlide(
  notes: PresentationNote[],
  slideId: string | null | undefined,
): PresentationNote[] {
  if (!slideId) return [];
  return notes.filter((note) => note.slide_id === slideId);
}
