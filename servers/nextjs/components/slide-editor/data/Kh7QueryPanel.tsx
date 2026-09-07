"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { RefreshCw, X } from "lucide-react";
import {
  Kh7Api,
  type CubeFilter,
  type Kh7DimensionValue,
  type Kh7ExecuteResponse,
  type Kh7Metadata,
  type Kh7Source,
} from "@/app/(presentation-generator)/services/api/kh7";
import type { DataBinding } from "@/components/slide-editor/types";

type Zone = "row" | "column" | "filter" | "value";

export function Kh7QueryPanel({
  binding,
  onApply,
}: {
  binding?: DataBinding | null;
  onApply: (result: Kh7ExecuteResponse, nextBinding: DataBinding) => void;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [origin, setOrigin] = useState<"kh7" | "mock" | null>(null);
  const [sources, setSources] = useState<Kh7Source[]>([]);
  const [sourceName, setSourceName] = useState(binding?.query_id ?? "");
  const [metadata, setMetadata] = useState<Kh7Metadata | null>(null);
  const [rowFields, setRowFields] = useState<string[]>(binding?.dimensions ?? []);
  const [columnFields, setColumnFields] = useState<string[]>(
    binding?.column_dimensions ?? [],
  );
  const [valueFields, setValueFields] = useState<string[]>(binding?.measures ?? []);
  const [filterFields, setFilterFields] = useState<string[]>(() =>
    (binding?.filters ?? [])
      .map((item) => item.dimension || item.column || "")
      .filter(Boolean),
  );
  const [filters, setFilters] = useState<Record<string, string[]>>(() => {
    const next: Record<string, string[]> = {};
    for (const item of binding?.filters ?? []) {
      const dim = item.dimension || item.column;
      if (!dim) continue;
      const values = item.values?.map(String) ?? (item.value == null ? [] : [String(item.value)]);
      next[dim] = values;
    }
    return next;
  });
  const [filterDim, setFilterDim] = useState<string | null>(null);
  const [dimValues, setDimValues] = useState<Kh7DimensionValue[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await Kh7Api.status();
        if (cancelled) return;
        setConfigured(status.configured);
        setOrigin(status.source ?? (status.configured ? "kh7" : null));
        if (!status.configured) return;
        const items = await Kh7Api.listSources();
        if (cancelled) return;
        setSources(items);
        if (!sourceName && items[0]) setSourceName(items[0].name);
      } catch (err) {
        if (!cancelled) {
          setConfigured(false);
          setError(err instanceof Error ? err.message : "KH7 not configured");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sourceName) {
      setMetadata(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const meta = await Kh7Api.metadata(sourceName);
        if (cancelled) return;
        setMetadata(meta);
        setRowFields((current) =>
          current.length ? current.filter((name) => meta.dimensions.some((d) => d.name === name)) : [],
        );
        setColumnFields((current) =>
          current.filter((name) => meta.dimensions.some((d) => d.name === name)),
        );
        setValueFields((current) =>
          current.length ? current.filter((name) => meta.measures.some((m) => m.name === name)) : [],
        );
        if (!binding?.query_id || binding.query_id !== sourceName) {
          const firstDim = meta.dimensions[0]?.name;
          const firstMeasure = meta.measures[0]?.name;
          const required = meta.initialFilters.filter((item) => item.required).map((item) => item.dimension);
          setRowFields(firstDim ? [firstDim] : []);
          setColumnFields([]);
          setValueFields(firstMeasure ? [firstMeasure] : []);
          setFilterFields(required);
          setFilters({});
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load metadata");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceName]);

  const assigned = useMemo(
    () => new Set([...rowFields, ...columnFields, ...filterFields, ...valueFields]),
    [rowFields, columnFields, filterFields, valueFields],
  );

  const captionOf = (name: string) => {
    const dim = metadata?.dimensions.find((item) => item.name === name);
    if (dim) return dim.caption;
    return metadata?.measures.find((item) => item.name === name)?.caption ?? name;
  };

  const moveTo = (name: string, zone: Zone | null) => {
    setRowFields((current) => current.filter((item) => item !== name));
    setColumnFields((current) => current.filter((item) => item !== name));
    setFilterFields((current) => current.filter((item) => item !== name));
    setValueFields((current) => current.filter((item) => item !== name));
    if (zone === "row") setRowFields((current) => [...current, name]);
    if (zone === "column") setColumnFields((current) => [...current, name]);
    if (zone === "filter") setFilterFields((current) => [...current, name]);
    if (zone === "value") setValueFields((current) => [...current, name]);
  };

  const openFilter = async (dimension: string) => {
    if (!sourceName) return;
    setFilterDim(dimension);
    setSearch("");
    try {
      setDimValues(await Kh7Api.dimensionValues(sourceName, dimension));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load values");
    }
  };

  const load = async () => {
    if (!sourceName || !metadata) return;
    setLoading(true);
    setError(null);
    try {
      const cubeFilters: CubeFilter[] = filterFields
        .map((dimension) => ({
          dimension,
          values: filters[dimension] ?? [],
        }))
        .filter((item) => item.values.length > 0);
      const result = await Kh7Api.execute({
        source: sourceName,
        dimensions: rowFields,
        column_dimensions: columnFields,
        measures: valueFields,
        filters: cubeFilters,
      });
      onApply(result, {
        source: origin === "mock" ? "mock" : "kh7",
        query_id: sourceName,
        query_name: result.query_name,
        dimensions: rowFields,
        column_dimensions: columnFields,
        measures: valueFields,
        filters: cubeFilters.map((item) => ({
          dimension: item.dimension,
          column: item.dimension,
          operator: "in",
          values: item.values,
        })),
        fetched_at: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute query");
    } finally {
      setLoading(false);
    }
  };

  if (configured === false) {
    return (
      <div className="rounded-xl border border-[#ECECF1] bg-[#F8F8FA] p-4 text-[12px] text-[#6B6B74]">
        KH7 not configured.
        {error ? <div className="mt-2 text-[#B42318]">{error}</div> : null}
      </div>
    );
  }

  if (configured === null) {
    return <div className="text-[12px] text-[#8B8B94]">Checking KH7 connection…</div>;
  }

  const availableDims = (metadata?.dimensions ?? []).filter((item) => !assigned.has(item.name));
  const availableMeasures = (metadata?.measures ?? []).filter((item) => !assigned.has(item.name));

  return (
    <div className="space-y-3">
      {origin === "mock" ? (
        <div className="rounded-lg border border-[#F3E4B8] bg-[#FFF8E4] px-3 py-2 text-[11px] text-[#6B5B1A]">
          Cubo mock (mismos datos que el plugin Análisis de OnlyOffice). Asigna
          dimensiones al eje X y medidas a las series.
        </div>
      ) : null}

      <label className="block text-[12px] font-medium text-[#191919]">
        Informe
        <select
          className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] bg-white px-3 text-[12px]"
          value={sourceName}
          onChange={(event) => setSourceName(event.target.value)}
        >
          <option value="">Selecciona…</option>
          {sources.map((item) => (
            <option key={item.name} value={item.name}>
              {item.description}
              {item.catalog ? ` · ${item.catalog}` : ""}
            </option>
          ))}
        </select>
      </label>

      {metadata ? (
        <>
          <FieldZone
            title="Campos disponibles"
            empty="Todos los campos están asignados"
          >
            {availableDims.map((item) => (
              <Chip key={item.name} label={item.caption} kind="dim">
                <MiniAction label="X" title="Eje X" onClick={() => moveTo(item.name, "row")} />
                <MiniAction label="↔" title="Desglose" onClick={() => moveTo(item.name, "column")} />
                <MiniAction label="F" title="Filtro" onClick={() => moveTo(item.name, "filter")} />
              </Chip>
            ))}
            {availableMeasures.map((item) => (
              <Chip
                key={item.name}
                label={item.caption}
                kind="meas"
                onClick={() => moveTo(item.name, "value")}
              />
            ))}
          </FieldZone>

          <FieldZone title="Eje X / categorías" empty="Añade una dimensión">
            {rowFields.map((name) => (
              <Chip key={name} label={captionOf(name)} kind="dim">
                <button type="button" className="opacity-50 hover:opacity-100" onClick={() => moveTo(name, null)}>
                  <X size={11} />
                </button>
              </Chip>
            ))}
          </FieldZone>

          <FieldZone title="Desglose / series extra" empty="Opcional: otra dimensión">
            {columnFields.map((name) => (
              <Chip key={name} label={captionOf(name)} kind="dim">
                <button type="button" className="opacity-50 hover:opacity-100" onClick={() => moveTo(name, null)}>
                  <X size={11} />
                </button>
              </Chip>
            ))}
          </FieldZone>

          <FieldZone title="Filtros" empty="Añade dimensiones para filtrar">
            {filterFields.map((name) => (
              <Chip
                key={name}
                label={`${captionOf(name)}${filters[name]?.length ? ` (${filters[name].length})` : ""}`}
                kind="dim"
                onClick={() => void openFilter(name)}
              >
                <button type="button" className="opacity-50 hover:opacity-100" onClick={(event) => {
                  event.stopPropagation();
                  moveTo(name, null);
                }}>
                  <X size={11} />
                </button>
              </Chip>
            ))}
          </FieldZone>

          <FieldZone title="Valores / series" empty="Añade una medida o ratio">
            {valueFields.map((name) => (
              <Chip key={name} label={captionOf(name)} kind="meas">
                <button type="button" className="opacity-50 hover:opacity-100" onClick={() => moveTo(name, null)}>
                  <X size={11} />
                </button>
              </Chip>
            ))}
          </FieldZone>
        </>
      ) : null}

      {filterDim ? (
        <div className="rounded-xl border border-[#ECECF1] bg-[#F8F8FA] p-3">
          <div className="mb-2 text-[12px] font-semibold text-[#191919]">
            Filtrar {captionOf(filterDim)}
          </div>
          <input
            className="mb-2 h-8 w-full rounded-lg border border-[#E6E6EA] px-2 text-[12px]"
            placeholder="Buscar…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-36 space-y-1 overflow-y-auto">
            {dimValues
              .filter((item) => {
                const q = search.toLowerCase();
                return !q || item.caption.toLowerCase().includes(q) || item.code.toLowerCase().includes(q);
              })
              .map((item) => {
                const checked = (filters[filterDim] ?? []).includes(item.code);
                return (
                  <label key={item.code} className="flex items-center gap-2 text-[11px] text-[#191919]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setFilters((current) => {
                          const values = new Set(current[filterDim] ?? []);
                          if (values.has(item.code)) values.delete(item.code);
                          else values.add(item.code);
                          return { ...current, [filterDim]: Array.from(values) };
                        });
                      }}
                    />
                    {item.caption} ({item.code})
                  </label>
                );
              })}
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              className="h-7 rounded-full border border-[#E6E6EA] bg-white px-3 text-[11px] font-semibold"
              onClick={() => setFilterDim(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-[12px] text-[#B42318]">{error}</p> : null}

      <button
        type="button"
        disabled={!sourceName || loading || rowFields.length === 0 || valueFields.length === 0}
        className="flex h-8 items-center gap-1.5 rounded-full border border-[#E6E6EA] bg-white px-4 text-[12px] font-semibold text-[#191919] transition hover:bg-[#F7F7FA] disabled:opacity-50"
        onClick={() => void load()}
      >
        <RefreshCw size={14} strokeWidth={2} />
        {loading ? "Cargando…" : "Cargar / refrescar"}
      </button>
    </div>
  );
}

function FieldZone({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: ReactNode;
}) {
  const hasChildren = Array.isArray(children)
    ? children.length > 0
    : Boolean(children);
  return (
    <div className="rounded-xl border border-[#ECECF1]">
      <div className="border-b border-[#ECECF1] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#8B8B94]">
        {title}
      </div>
      <div className="flex min-h-9 flex-wrap gap-1 px-2 py-2">
        {hasChildren ? children : <span className="text-[11px] italic text-[#B0B0B8]">{empty}</span>}
      </div>
    </div>
  );
}

function Chip({
  label,
  kind,
  onClick,
  children,
}: {
  label: string;
  kind: "dim" | "meas";
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
        kind === "dim"
          ? "border-[#B8D0EB] bg-[#E3ECF7] text-[#2B5797]"
          : "border-[#A5D6A7] bg-[#E8F5E9] text-[#2E7D32]"
      }`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      {label}
      {children}
    </span>
  );
}

function MiniAction({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      className="rounded bg-white/70 px-1 text-[9px] font-bold leading-4 hover:bg-white"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {label}
    </button>
  );
}
