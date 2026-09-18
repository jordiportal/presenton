"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Kh7Api,
  type Kh7Dimension,
  type Kh7Measure,
  type Kh7Source,
} from "@/app/(presentation-generator)/services/api/kh7";
import type { DataBinding, IbcsChartConfig } from "@/components/slide-editor/types";
import { fetchIbcsTableMembers } from "@/components/slide-editor/ibcs/fetch";
import { parseIbcsDecimals } from "@/components/slide-editor/ibcs/format";
import type { IbcsTableMember } from "@/components/slide-editor/ibcs/table-columns";
import {
  mergeIbcsConfig,
  previousYear,
  resolveCurrentYear,
  specFromConfig,
} from "@/components/slide-editor/ibcs/spec";

export function IbcsColumnQueryPanel({
  binding,
  extraFilters,
  ibcs,
  onApply,
}: {
  binding?: DataBinding | null;
  extraFilters?: DataBinding["filters"];
  ibcs?: IbcsChartConfig | null;
  onApply: (payload: {
    members: IbcsTableMember[];
    binding: DataBinding;
    ibcs: IbcsChartConfig;
    measureCaption: string;
  }) => void;
}) {
  const [sources, setSources] = useState<Kh7Source[]>([]);
  const [sourceName, setSourceName] = useState(binding?.query_id ?? "");
  const [dimensions, setDimensions] = useState<Kh7Dimension[]>([]);
  const [measures, setMeasures] = useState<Kh7Measure[]>([]);
  const [measure, setMeasure] = useState(binding?.measures?.[0] ?? ibcs?.measure ?? "");
  const [rowDimension, setRowDimension] = useState(
    binding?.dimensions?.[0] ?? ibcs?.row_dimension ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [yearInput, setYearInput] = useState(resolveCurrentYear(ibcs?.current_year));
  const spec = specFromConfig({ ...ibcs, kind: "column" });
  const year = resolveCurrentYear(yearInput);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await Kh7Api.listSources();
        if (cancelled) return;
        setSources(items);
        if (!sourceName && items[0]) setSourceName(items[0].name);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo listar informes");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!sourceName) {
      setMeasures([]);
      setDimensions([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const meta = await Kh7Api.metadata(sourceName);
        if (cancelled) return;
        setMeasures(meta.measures);
        setDimensions(meta.dimensions);
        setMeasure((current) =>
          current && meta.measures.some((item) => item.name === current)
            ? current
            : (meta.measures[0]?.name ?? ""),
        );
        setRowDimension((current) =>
          current && meta.dimensions.some((item) => item.name === current)
            ? current
            : (meta.dimensions.find((item) => !/CALYEAR|VERSION|CALMONTH/i.test(item.name))
                ?.name ??
              meta.dimensions[0]?.name ??
              ""),
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "No se pudo cargar metadata");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceName]);

  const load = async () => {
    if (!sourceName || !measure || !rowDimension) return;
    setLoading(true);
    setError(null);
    try {
      const meta = await Kh7Api.metadata(sourceName);
      const fetched = await fetchIbcsTableMembers({
        source: sourceName,
        measure,
        currentYear: year,
        rowDimension,
        spec,
        knownDimensions: meta.dimensions.map((item) => item.name),
        extraFilters: (extraFilters ?? [])
          .filter((item) => (item.values?.length ?? 0) > 0)
          .map((item) => ({
            dimension: String(item.dimension || item.column || ""),
            values: (item.values ?? []).map(String),
          })),
      });
      const measureMeta = meta.measures.find((item) => item.name === measure);
      const caption = measureMeta?.caption ?? measure;
      const source = sources.find((item) => item.name === sourceName);
      const nextIbcs = mergeIbcsConfig(ibcs, {
        kind: "column",
        measure,
        current_year: year,
        row_dimension: rowDimension,
        members: fetched.members,
        unit: measureMeta?.unit || fetched.unit || ibcs?.unit || null,
        decimals:
          parseIbcsDecimals(measureMeta?.decimals) ??
          fetched.decimals ??
          ibcs?.decimals ??
          null,
        year_dimension: spec.yearDimension,
        version_dimension: spec.versionDimension,
        version_codes: spec.versionCodes,
      }) as IbcsChartConfig;
      onApply({
        members: fetched.members,
        ibcs: nextIbcs,
        measureCaption: caption,
        binding: {
          source: "kh7",
          query_id: sourceName,
          query_name: source?.description || sourceName,
          dimensions: [rowDimension],
          measures: [measure],
          filters: extraFilters ?? [],
          fetched_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el gráfico IBCS");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[#D6E4FF] bg-[#F0F5FF] px-3 py-2 text-[11px] text-[#2B5797]">
        Elige la dimensión de categorías y el ratio. El complemento genera las columnas AC
        con la variación Δ integrada y las filas de varianza %. AC AY = {year} Real (
        {spec.versionCodes.actual}), ΔPY = {previousYear(year)} Real, ΔFC = {year} Forecast (
        {spec.versionCodes.forecast}), ΔPL = {year} Plan ({spec.versionCodes.plan}).
      </div>
      <Field label="Informe">
        <select
          className={inputClass()}
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
      </Field>
      <Field label="Año actual">
        <input
          className={inputClass()}
          inputMode="numeric"
          maxLength={4}
          value={yearInput}
          onChange={(event) =>
            setYearInput(event.target.value.replace(/\D/g, "").slice(0, 4))
          }
        />
      </Field>
      <Field label="Dimensión (categorías)">
        <select
          className={inputClass()}
          value={rowDimension}
          onChange={(event) => setRowDimension(event.target.value)}
        >
          <option value="">Selecciona…</option>
          {dimensions.map((item) => (
            <option key={item.name} value={item.name}>
              {item.caption}
              {item.caption !== item.name ? ` · ${item.name}` : ""}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Ratio">
        <select
          className={inputClass()}
          value={measure}
          onChange={(event) => setMeasure(event.target.value)}
        >
          <option value="">Selecciona…</option>
          {measures.map((item) => (
            <option key={item.name} value={item.name}>
              {item.caption}
              {item.unit ? ` · ${item.unit}` : ""}
            </option>
          ))}
        </select>
      </Field>
      {error ? <div className="text-[12px] text-[#B42318]">{error}</div> : null}
      <button
        type="button"
        className="h-9 rounded-lg bg-[#191919] px-4 text-[12px] font-semibold text-white disabled:opacity-50"
        disabled={!sourceName || !measure || !rowDimension || loading || yearInput.length !== 4}
        onClick={() => void load()}
      >
        {loading ? "Cargando…" : "Cargar gráfico IBCS"}
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[12px] font-medium text-[#191919]">
      {label}
      {children}
    </label>
  );
}

function inputClass() {
  return "mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] bg-white px-3 text-[12px]";
}
