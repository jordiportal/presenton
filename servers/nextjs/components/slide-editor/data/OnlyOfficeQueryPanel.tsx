"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import {
  OnlyOfficeApi,
  type OnlyOfficeReadResponse,
  type OnlyOfficeStatus,
} from "@/app/(presentation-generator)/services/api/onlyoffice";
import type { DataBinding } from "@/components/slide-editor/types";

function bindingFromRead(
  result: OnlyOfficeReadResponse,
  previous?: DataBinding | null,
): DataBinding {
  return {
    source: "onlyoffice",
    query_id: result.query_id,
    query_name: result.document_name || previous?.query_name || result.query_id,
    document_name: result.document_name ?? previous?.document_name ?? null,
    sheet: result.sheet,
    range: result.range,
    filters: [],
    fetched_at: new Date().toISOString(),
  };
}

export function OnlyOfficeQueryPanel({
  binding,
  onApply,
}: {
  binding?: DataBinding | null;
  onApply: (result: OnlyOfficeReadResponse, nextBinding: DataBinding) => void;
}) {
  const [status, setStatus] = useState<OnlyOfficeStatus | null>(null);
  const [sheet, setSheet] = useState(binding?.sheet ?? "");
  const [range, setRange] = useState(binding?.range ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"selection" | "range" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await OnlyOfficeApi.status();
        if (!cancelled) setStatus(next);
      } catch (err) {
        if (!cancelled) {
          setStatus({ configured: false, connected: false });
          setError(
            err instanceof Error ? err.message : "OnlyOffice MCP no disponible",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const apply = (result: OnlyOfficeReadResponse) => {
    setSheet(result.sheet);
    setRange(result.range);
    onApply(result, bindingFromRead(result, binding));
  };

  const run = async (mode: "selection" | "range") => {
    setError(null);
    setLoading(mode);
    try {
      const result =
        mode === "selection"
          ? await OnlyOfficeApi.readSelection()
          : await OnlyOfficeApi.readRange({
              range: range.trim(),
              sheet: sheet.trim() || undefined,
            });
      apply(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudo leer el Excel",
      );
    } finally {
      setLoading(null);
    }
  };

  if (!status) {
    return (
      <div className="text-[12px] text-[#8B8B94]">
        Comprobando OnlyOffice…
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="rounded-xl border border-[#ECECF1] bg-[#F8F8FA] p-4 text-[12px] text-[#6B6B74]">
        Configura <code className="text-[11px]">ONLYOFFICE_MCP_URL</code> para
        usar un Excel abierto (plugin Brain Bridge).
        {error ? <div className="mt-2 text-[#B42318]">{error}</div> : null}
      </div>
    );
  }

  const documents =
    status.sessions
      ?.map((item) => item.document_name)
      .filter((name): name is string => Boolean(name)) ?? [];

  return (
    <div className="space-y-3">
      <div
        className={`rounded-lg border px-3 py-2 text-[11px] ${
          status.connected
            ? "border-[#D7E8D0] bg-[#F3FAF0] text-[#3F6B2F]"
            : "border-[#F3E4B8] bg-[#FFF8E4] text-[#6B5B1A]"
        }`}
      >
        {status.connected
          ? `Excel conectado${documents[0] ? `: ${documents[0]}` : ""}. Selecciona un rango en OnlyOffice y pulsa Usar selección.`
          : status.error ||
            "Abre un libro en OnlyOffice con el plugin Brain Bridge conectado al MCP."}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!status.connected || loading !== null}
          onClick={() => void run("selection")}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-[#111827] px-3 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {loading === "selection" ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : null}
          Usar selección actual
        </button>
        <button
          type="button"
          disabled={!status.connected || !range.trim() || loading !== null}
          onClick={() => void run("range")}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#E6E6EA] bg-white px-3 text-[12px] font-semibold text-[#191919] disabled:opacity-50"
        >
          {loading === "range" ? (
            <RefreshCw size={13} className="animate-spin" />
          ) : (
            <RefreshCw size={13} />
          )}
          Leer rango
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[12px] font-medium text-[#191919]">
          Hoja
          <input
            value={sheet}
            onChange={(event) => setSheet(event.currentTarget.value)}
            placeholder="Hoja1"
            className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] bg-white px-3 text-[12px]"
          />
        </label>
        <label className="block text-[12px] font-medium text-[#191919]">
          Rango
          <input
            value={range}
            onChange={(event) => setRange(event.currentTarget.value)}
            placeholder="A1:D20"
            className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] bg-white px-3 text-[12px]"
          />
        </label>
      </div>

      {error ? (
        <div className="text-[12px] text-[#B42318]">{error}</div>
      ) : null}
    </div>
  );
}
