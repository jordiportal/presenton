"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Check, MessageSquarePlus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PresentationNote } from "../../services/api/notes";

function pinPosition(note: Pick<PresentationNote, "x" | "y"> | { x: number; y: number }) {
  return {
    left: `${Math.round(((note.x ?? 0.94) * 1000) / 10)}%`,
    top: `${Math.round(((note.y ?? 0.08) * 1000) / 10)}%`,
  };
}

function formatNoteTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function NoteComposer({
  placeholder,
  submitLabel,
  onSubmit,
  onCancel,
  autoFocus = true,
}: {
  placeholder: string;
  submitLabel: string;
  onSubmit: (body: string) => Promise<boolean> | boolean;
  onCancel?: () => void;
  autoFocus?: boolean;
}) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const next = body.trim();
    if (!next || saving) return;
    setSaving(true);
    const ok = await onSubmit(next);
    setSaving(false);
    if (ok) setBody("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={3}
        maxLength={4000}
        className="w-full resize-none rounded-lg border border-[#E4E4E8] bg-white px-2.5 py-2 font-syne text-[13px] text-[#101323] outline-none ring-[#7A5AF8] placeholder:text-[#98A2B3] focus:border-[#C9C2F5] focus:ring-2"
      />
      <div className="flex items-center justify-end gap-2">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-2 py-1 text-[12px] text-[#667085] hover:bg-[#F2F4F7]"
          >
            Cancel
          </button>
        ) : null}
        <button
          type="submit"
          disabled={saving || !body.trim()}
          className="rounded-lg bg-[#7A5AF8] px-2.5 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function NoteThread({
  note,
  canWrite,
  onReply,
  onResolve,
  onDelete,
}: {
  note: PresentationNote;
  canWrite: boolean;
  onReply: (noteId: string, body: string) => Promise<boolean>;
  onResolve: (noteId: string, resolved: boolean) => Promise<boolean>;
  onDelete: (noteId: string) => Promise<boolean>;
}) {
  const items = [note, ...(note.replies ?? [])];

  return (
    <div className="flex w-[280px] flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-syne text-[13px] font-semibold text-[#101323]">
            {note.resolved ? "Resolved note" : "Note"}
          </p>
          <p className="text-[11px] text-[#667085]">
            {note.replies?.length
              ? `${note.replies.length} ${note.replies.length === 1 ? "reply" : "replies"}`
              : "No replies yet"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {canWrite ? (
            <button
              type="button"
              onClick={() => void onResolve(note.id, !note.resolved)}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-[#667085] hover:bg-[#F2F4F7] hover:text-[#101323]"
            >
              <Check className="h-3 w-3" />
              {note.resolved ? "Reopen" : "Resolve"}
            </button>
          ) : null}
          {note.can_delete ? (
            <button
              type="button"
              aria-label="Delete note"
              onClick={() => void onDelete(note.id)}
              className="rounded-md p-1 text-[#667085] hover:bg-[#FEF3F2] hover:text-[#B42318]"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="max-h-[240px] space-y-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg border border-[#EEF0F4] bg-[#F8F8FA] px-2.5 py-2"
          >
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-[#344054]">
                {item.mine ? "You" : item.author_username}
              </span>
              <span className="text-[10px] text-[#98A2B3]">
                {formatNoteTime(item.created_at)}
              </span>
            </div>
            <p className="whitespace-pre-wrap text-[13px] leading-5 text-[#101323]">
              {item.body}
            </p>
            {item.parent_id && item.can_delete ? (
              <button
                type="button"
                onClick={() => void onDelete(item.id)}
                className="mt-1 text-[11px] text-[#98A2B3] hover:text-[#B42318]"
              >
                Delete
              </button>
            ) : null}
          </div>
        ))}
      </div>
      {canWrite && !note.resolved ? (
        <NoteComposer
          placeholder="Reply to this note"
          submitLabel="Reply"
          onSubmit={(body) => onReply(note.id, body)}
        />
      ) : null}
    </div>
  );
}

export function SlideNotesOverlay({
  notes,
  visible,
  placing,
  selectedId,
  draft,
  canWrite,
  onPlace,
  onSelect,
  onCancelDraft,
  onCreate,
  onReply,
  onResolve,
  onDelete,
}: {
  notes: PresentationNote[];
  visible: boolean;
  placing: boolean;
  selectedId: string | null;
  draft: { x: number; y: number } | null;
  canWrite: boolean;
  onPlace: (x: number, y: number) => void;
  onSelect: (noteId: string | null) => void;
  onCancelDraft: () => void;
  onCreate: (body: string, x?: number, y?: number) => Promise<boolean>;
  onReply: (noteId: string, body: string) => Promise<boolean>;
  onResolve: (noteId: string, resolved: boolean) => Promise<boolean>;
  onDelete: (noteId: string) => Promise<boolean>;
}) {
  const [showResolved, setShowResolved] = useState(false);

  useEffect(() => {
    if (!placing && !draft) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancelDraft();
        onSelect(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draft, onCancelDraft, onSelect, placing]);

  const pins = useMemo(
    () => notes.filter((note) => showResolved || !note.resolved),
    [notes, showResolved],
  );

  if (!visible && !placing && !draft) return null;

  return (
    <div
      className={cn(
        "absolute inset-0 z-[88] rounded-[14px]",
        placing ? "cursor-crosshair" : "pointer-events-none",
      )}
      data-slide-notes="true"
      onClick={
        placing
          ? (event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              if (!bounds.width || !bounds.height) return;
              onPlace(
                Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
                Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
              );
            }
          : undefined
      }
    >
      {placing ? (
        <div className="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-[#101323]/90 px-2.5 py-1 text-[11px] font-medium text-white">
          <MessageSquarePlus className="h-3 w-3" />
          Click the slide to place a note
        </div>
      ) : null}

      {draft ? (
        <div
          className="pointer-events-auto absolute z-20 w-[280px] -translate-x-1/2 rounded-xl border border-[#E4E4E8] bg-white p-3 shadow-[0_12px_32px_rgba(16,24,40,0.16)]"
          style={{
            left: `${Math.round(draft.x * 1000) / 10}%`,
            top: `${Math.round(draft.y * 1000) / 10}%`,
          }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-[#101323]">New note</p>
            <button
              type="button"
              aria-label="Cancel note"
              onClick={onCancelDraft}
              className="rounded-md p-1 text-[#667085] hover:bg-[#F2F4F7]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <NoteComposer
            placeholder="Write a note for collaborators"
            submitLabel="Add note"
            onSubmit={(body) => onCreate(body, draft.x, draft.y)}
            onCancel={onCancelDraft}
          />
        </div>
      ) : null}

      {visible
        ? pins.map((note, index) => {
            const open = selectedId === note.id;
            return (
              <div
                key={note.id}
                className="pointer-events-auto absolute z-10"
                style={pinPosition(note)}
              >
                <button
                  type="button"
                  aria-label={`Note ${index + 1} by ${note.author_username}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(open ? null : note.id);
                  }}
                  className={cn(
                    "-translate-x-1/2 -translate-y-1/2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white text-[11px] font-semibold text-white shadow-[0_4px_12px_rgba(16,24,40,0.18)]",
                    note.resolved
                      ? "bg-[#98A2B3]"
                      : open
                        ? "bg-[#5141E5]"
                        : "bg-[#7A5AF8]",
                  )}
                >
                  {index + 1}
                </button>
                {open ? (
                  <div
                    className="absolute left-3 top-0 z-20 rounded-xl border border-[#E4E4E8] bg-white p-3 shadow-[0_12px_32px_rgba(16,24,40,0.16)]"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <NoteThread
                      note={note}
                      canWrite={canWrite}
                      onReply={onReply}
                      onResolve={onResolve}
                      onDelete={onDelete}
                    />
                    {notes.some((item) => item.resolved) ? (
                      <button
                        type="button"
                        onClick={() => setShowResolved((current) => !current)}
                        className="mt-2 text-[11px] text-[#667085] hover:text-[#101323]"
                      >
                        {showResolved ? "Hide resolved" : "Show resolved"}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        : null}
    </div>
  );
}
