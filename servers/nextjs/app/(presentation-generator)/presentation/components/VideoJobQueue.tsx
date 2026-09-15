"use client";

import { Check, Clapperboard, Loader2, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useVideoJobQueue } from "../hooks/useVideoJobQueue";
import type { VideoAnimateTask } from "@/app/(presentation-generator)/services/api/videos";

function slideLabel(task: VideoAnimateTask) {
  const index = task.data?.slide_index;
  return typeof index === "number" ? `Diapositiva ${index + 1}` : "Vídeo";
}

function promptLabel(task: VideoAnimateTask) {
  const prompt = (task.data?.prompt || "").trim();
  if (prompt) return prompt;
  return task.message || "Animar imagen";
}

function statusIcon(status: string) {
  if (status === "pending") {
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-[#5141E5]" />;
  }
  if (status === "completed") {
    return <Check className="h-3.5 w-3.5 text-[#039855]" />;
  }
  return <X className="h-3.5 w-3.5 text-[#D92D20]" />;
}

function statusLabel(task: VideoAnimateTask) {
  if (task.status === "pending") return "Generando…";
  if (task.status === "completed") return "Listo";
  const detail = task.error?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  return "Error";
}

export function VideoJobQueueButton({
  presentationId,
}: {
  presentationId: string;
}) {
  const { tasks, pendingCount } = useVideoJobQueue(presentationId);
  const visible = tasks.slice(0, 12);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Cola de vídeos"
          aria-label="Cola de vídeos"
          className={cn(
            "inline-flex h-[38px] items-center gap-2 rounded-xl border px-3 font-syne text-xs font-semibold shadow-sm transition",
            pendingCount > 0
              ? "border-[#CEC6FF] bg-[#F3F0FF] text-[#5141E5]"
              : "border-[#E4E4E8] bg-white text-[#3D3D48] hover:border-[#D7D2F5] hover:bg-[#FAF9FF] hover:text-[#5141E5]",
          )}
        >
          {pendingCount > 0 ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Clapperboard className="h-3.5 w-3.5" />
          )}
          Queue
          {pendingCount > 0 ? (
            <span className="inline-flex min-w-4 items-center justify-center rounded-full bg-[#5141E5] px-1 text-[10px] font-semibold leading-4 text-white">
              {pendingCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[320px] rounded-2xl border border-[#EDECEC] p-0 shadow-lg"
      >
        <div className="border-b border-[#F0F0F3] px-3.5 py-2.5">
          <p className="font-syne text-sm font-semibold text-[#101323]">
            Cola de vídeos
          </p>
          <p className="text-[11px] text-[#667085]">
            Puedes seguir editando mientras se generan.
          </p>
        </div>
        {visible.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-xs text-[#98A2B3]">
            No hay vídeos en cola.
          </p>
        ) : (
          <ul className="max-h-[280px] overflow-y-auto py-1">
            {visible.map((task) => (
              <li
                key={task.id}
                className="flex items-start gap-2.5 px-3.5 py-2"
              >
                <span className="mt-0.5 shrink-0">{statusIcon(task.status)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[#101323]">
                    {slideLabel(task)}
                  </p>
                  <p className="truncate text-[11px] text-[#667085]">
                    {promptLabel(task)}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-[11px]",
                      task.status === "error"
                        ? "text-[#D92D20]"
                        : "text-[#98A2B3]",
                    )}
                  >
                    {statusLabel(task)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
