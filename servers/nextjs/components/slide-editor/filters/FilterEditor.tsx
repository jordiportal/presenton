"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Kh7Api } from "@/app/(presentation-generator)/services/api/kh7";
import type {
  FilterElement,
  FilterOption,
  FilterWidgetKind,
} from "@/components/slide-editor/types";
import {
  defaultDimensionForKind,
  defaultOptionsForKind,
  filterKindLabel,
} from "@/components/slide-editor/filters/filter-model";
import { buildTreemapNodes } from "@/components/slide-editor/filters/treemap-data";
import {
  flattenTreemapNodes,
  TREEMAP_EXAMPLE,
} from "@/components/slide-editor/filters/treemap-layout";

const KINDS: FilterWidgetKind[] = [
  "temporal",
  "year",
  "radio",
  "multi",
  "dropdown",
  "search",
  "treemap",
];

export function FilterEditorPopover({
  filter,
  onChange,
  onClose,
}: {
  filter: FilterElement;
  onChange: (filter: FilterElement) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(filter);
  const [sources, setSources] = useState<Array<{ name: string; description: string }>>([]);
  const [dimensions, setDimensions] = useState<Array<{ name: string; caption: string }>>([]);
  const [measures, setMeasures] = useState<Array<{ name: string; caption: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await Kh7Api.listSources();
        if (cancelled) return;
        setSources(items);
        if (!draft.source && items[0]) {
          setDraft((current) => ({ ...current, source: items[0].name }));
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar el cubo");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const source = draft.source;
    if (!source) return;
    let cancelled = false;
    (async () => {
      try {
        const meta = await Kh7Api.metadata(source);
        if (cancelled) return;
        setDimensions(meta.dimensions);
        setMeasures(meta.measures);
        const preferred = defaultDimensionForKind(draft.filter_kind);
        const skipTime = draft.filter_kind === "treemap";
        const dimension =
          (draft.dimension &&
          meta.dimensions.some((item) => item.name === draft.dimension)
            ? draft.dimension
            : null) ||
          (preferred &&
          meta.dimensions.some((item) => item.name === preferred)
            ? preferred
            : null) ||
          (!skipTime
            ? meta.dimensions.find((item) =>
                /CALMONTH2|CALMONTH|MES/i.test(`${item.name} ${item.caption}`),
              )?.name
            : null) ||
          meta.dimensions.find((item) =>
            skipTime
              ? !/CALYEAR|VERSION|CALMONTH|0CALWEEK/i.test(item.name)
              : true,
          )?.name ||
          meta.dimensions[0]?.name ||
          "";
        const measure =
          (draft.measure &&
          meta.measures.some((item) => item.name === draft.measure)
            ? draft.measure
            : null) ||
          meta.measures[0]?.name ||
          "";
        setDraft((current) => ({
          ...current,
          dimension: dimension || current.dimension,
          measure:
            current.filter_kind === "treemap"
              ? measure || current.measure
              : current.measure,
        }));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar metadatos");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.source]);

  useEffect(() => {
    const source = draft.source;
    const dimension = draft.dimension;
    if (!source || !dimension || draft.filter_kind === "treemap") return;
    let cancelled = false;
    (async () => {
      try {
        const values = await Kh7Api.dimensionValues(source, dimension);
        if (cancelled) return;
        const options: FilterOption[] =
          values.length > 0
            ? values.map((item) => ({ code: item.code, caption: item.caption }))
            : defaultOptionsForKind(draft.filter_kind);
        setDraft((current) => ({
          ...current,
          options,
          label:
            current.label ||
            dimensions.find((item) => item.name === current.dimension)?.caption ||
            filterKindLabel(current.filter_kind),
        }));
      } catch {
        if (!cancelled) {
          setDraft((current) => ({
            ...current,
            options: current.options?.length
              ? current.options
              : defaultOptionsForKind(current.filter_kind),
          }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.source, draft.dimension, draft.filter_kind]);

  const loadTreemap = async () => {
    const source = draft.source?.trim() || "";
    const parentDim = draft.dimension?.trim() || "";
    const measure = draft.measure?.trim() || "";
    if (!source || !parentDim || !measure) return;
    setLoading(true);
    setError(null);
    try {
      const child = draft.child_dimension?.trim() || "";
      const dims = child ? [parentDim, child] : [parentDim];
      const [result, parentValues, childValues] = await Promise.all([
        Kh7Api.execute({
          source,
          dimensions: dims,
          measures: [measure],
        }),
        Kh7Api.dimensionValues(source, parentDim),
        child ? Kh7Api.dimensionValues(source, child) : Promise.resolve([]),
      ]);
      const nodes = buildTreemapNodes(result, {
        hasChild: Boolean(child),
        parentValues,
        childValues,
      });
      const flat = flattenTreemapNodes(nodes);
      setDraft((current) => ({
        ...current,
        nodes,
        options: flat.map((item) => ({ code: item.code, caption: item.caption })),
        selected: [],
        data_binding: {
          source: "kh7",
          query_id: source,
          query_name: sources.find((item) => item.name === source)?.description,
          dimensions: dims,
          measures: [measure],
          filters: [],
          fetched_at: new Date().toISOString(),
        },
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el treemap");
    } finally {
      setLoading(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      data-inline-edit-ignore="true"
      className="fixed inset-0 z-[10010] flex items-center justify-center bg-black/35 p-4 font-syne"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className={`relative w-full rounded-2xl bg-white p-5 shadow-[0_24px_80px_rgba(16,24,40,0.24)] ${
        draft.filter_kind === "treemap" ? "max-w-[480px]" : "max-w-[420px]"
      }`}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#191919]">Filtro dinámico</h2>
            <p className="mt-1 text-[11px] text-[#8B8B94]">
              Se aplica a las gráficas y tablas KH7 de esta diapositiva.
            </p>
          </div>
          <button
            type="button"
            aria-label="Cerrar"
            className="grid h-8 w-8 place-items-center rounded-full hover:bg-[#F7F7FA]"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        <label className="mb-3 block text-[12px] font-medium text-[#191919]">
          Tipo
          <select
            className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px]"
            value={draft.filter_kind}
            onChange={(event) => {
              const kind = event.target.value as FilterWidgetKind;
              setDraft((current) => {
                const preferred = defaultDimensionForKind(kind);
                const dimension =
                  (preferred &&
                  dimensions.some((item) => item.name === preferred)
                    ? preferred
                    : null) ||
                  dimensions.find((item) =>
                    kind === "year"
                      ? /CALYEAR|AÑO|ANO/i.test(`${item.name} ${item.caption}`)
                      : kind === "temporal"
                        ? /CALMONTH2|CALMONTH|MES/i.test(
                            `${item.name} ${item.caption}`,
                          )
                        : kind === "treemap"
                          ? !/CALYEAR|VERSION|CALMONTH|0CALWEEK/i.test(
                              item.name,
                            )
                          : false,
                  )?.name ||
                  current.dimension;
                return {
                  ...current,
                  filter_kind: kind,
                  dimension,
                  options: defaultOptionsForKind(kind),
                  selected: [],
                  label: filterKindLabel(kind),
                  nodes:
                    kind === "treemap"
                      ? current.nodes?.length
                        ? current.nodes
                        : TREEMAP_EXAMPLE
                      : current.nodes,
                  size:
                    kind === "treemap"
                      ? {
                          width: Math.max(current.size?.width ?? 0, 720),
                          height: Math.max(current.size?.height ?? 0, 380),
                        }
                      : current.size,
                };
              });
            }}
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {filterKindLabel(kind)}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block text-[12px] font-medium text-[#191919]">
          Informe
          <select
            className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px]"
            value={draft.source ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                source: event.target.value,
                dimension: "",
                selected: [],
              }))
            }
          >
            <option value="">Selecciona…</option>
            {sources.map((item) => (
              <option key={item.name} value={item.name}>
                {item.description}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-3 block text-[12px] font-medium text-[#191919]">
          {draft.filter_kind === "treemap" ? "Dimensión (grupo)" : "Dimensión"}
          <select
            className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px]"
            value={draft.dimension ?? ""}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                dimension: event.target.value,
                selected: [],
              }))
            }
          >
            <option value="">Selecciona…</option>
            {dimensions.map((item) => (
              <option key={item.name} value={item.name}>
                {item.caption}
              </option>
            ))}
          </select>
        </label>

        {draft.filter_kind === "treemap" ? (
          <>
            <label className="mb-3 block text-[12px] font-medium text-[#191919]">
              Dimensión (detalle, opcional)
              <select
                className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px]"
                value={draft.child_dimension ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    child_dimension: event.target.value || null,
                    selected: [],
                  }))
                }
              >
                <option value="">Solo grupo</option>
                {dimensions
                  .filter((item) => item.name !== draft.dimension)
                  .map((item) => (
                    <option key={item.name} value={item.name}>
                      {item.caption}
                    </option>
                  ))}
              </select>
            </label>
            <label className="mb-3 block text-[12px] font-medium text-[#191919]">
              Ratio (área)
              <select
                className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px]"
                value={draft.measure ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    measure: event.target.value,
                  }))
                }
              >
                <option value="">Selecciona…</option>
                {measures.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.caption}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="mb-4 h-9 rounded-lg bg-[#191919] px-4 text-[12px] font-semibold text-white disabled:opacity-50"
              disabled={
                !draft.source || !draft.dimension || !draft.measure || loading
              }
              onClick={() => void loadTreemap()}
            >
              {loading ? "Cargando…" : "Cargar treemap"}
            </button>
          </>
        ) : null}

        <label className="mb-4 block text-[12px] font-medium text-[#191919]">
          Etiqueta
          <input
            className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] px-3 text-[12px]"
            value={draft.label ?? ""}
            onChange={(event) =>
              setDraft((current) => ({ ...current, label: event.target.value }))
            }
          />
        </label>

        {error ? <p className="mb-3 text-[12px] text-[#B42318]">{error}</p> : null}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="h-8 rounded-full border border-[#E6E6EA] px-4 text-[12px] font-semibold"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="h-8 rounded-full bg-[linear-gradient(100deg,#FFE6A6_0%,#D8B4FE_100%)] px-5 text-[12px] font-semibold"
            onClick={() => {
              onChange(draft);
              onClose();
            }}
          >
            Guardar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
