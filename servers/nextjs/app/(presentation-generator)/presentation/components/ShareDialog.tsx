"use client";

import { useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notify } from "@/components/ui/sonner";
import {
  SharingApi,
  type PresentationShare,
  type ShareRole,
} from "../../services/api/sharing";

export function ShareDialog({
  presentationId,
  open,
  onOpenChange,
}: {
  presentationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [shares, setShares] = useState<PresentationShare[]>([]);
  const [username, setUsername] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void SharingApi.list(presentationId)
      .then((next) => {
        if (!cancelled) setShares(next);
      })
      .catch((error) => {
        notify.error(
          "Could not load sharing",
          error instanceof Error ? error.message : undefined,
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, presentationId]);

  const handleAdd = async () => {
    const nextUsername = username.trim();
    if (!nextUsername || saving) return;
    setSaving(true);
    try {
      const share = await SharingApi.add(presentationId, nextUsername, role);
      setShares((current) => {
        const without = current.filter((item) => item.username !== share.username);
        return [...without, share].sort((a, b) => a.username.localeCompare(b.username));
      });
      setUsername("");
      notify.success("Presentation shared", `${share.username} can now open this deck.`);
    } catch (error) {
      notify.error(
        "Could not share",
        error instanceof Error ? error.message : "Check the username and try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleRoleChange = async (share: PresentationShare, nextRole: ShareRole) => {
    try {
      const updated = await SharingApi.updateRole(presentationId, share.id, nextRole);
      setShares((current) =>
        current.map((item) => (item.id === share.id ? updated : item)),
      );
    } catch (error) {
      notify.error(
        "Could not update role",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  const handleRemove = async (share: PresentationShare) => {
    try {
      await SharingApi.remove(presentationId, share.id);
      setShares((current) => current.filter((item) => item.id !== share.id));
    } catch (error) {
      notify.error(
        "Could not remove access",
        error instanceof Error ? error.message : undefined,
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px] font-syne">
        <DialogHeader>
          <DialogTitle>Share presentation</DialogTitle>
          <DialogDescription>
            Invite another Presenton user by username. Editors can change slides;
            viewers can only present and export.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handleAdd();
          }}
        >
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            className="h-10 min-w-0 flex-1 rounded-xl border border-[#E4E4E8] bg-white px-3 text-sm outline-none focus:border-[#6D5DFB] focus:ring-2 focus:ring-[#6D5DFB]/20"
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as ShareRole)}
            className="h-10 rounded-xl border border-[#E4E4E8] bg-white px-2 text-sm outline-none"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="submit"
            disabled={saving || !username.trim()}
            className="inline-flex h-10 items-center gap-1 rounded-xl bg-[#5141E5] px-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Invite
          </button>
        </form>
        <div className="max-h-[240px] space-y-2 overflow-y-auto">
          {loading ? (
            <p className="py-6 text-center text-sm text-[#667085]">Loading…</p>
          ) : shares.length === 0 ? (
            <p className="py-6 text-center text-sm text-[#667085]">
              Not shared with anyone yet.
            </p>
          ) : (
            shares.map((share) => (
              <div
                key={share.id}
                className="flex items-center gap-2 rounded-xl border border-[#EDEEEF] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[#101323]">
                    {share.username}
                  </p>
                </div>
                <select
                  value={share.role}
                  onChange={(event) =>
                    void handleRoleChange(share, event.target.value as ShareRole)
                  }
                  className="h-8 rounded-lg border border-[#E4E4E8] bg-white px-2 text-xs outline-none"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  type="button"
                  aria-label={`Remove ${share.username}`}
                  onClick={() => void handleRemove(share)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#667085] hover:bg-[#FEF3F2] hover:text-[#D92D20]"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
