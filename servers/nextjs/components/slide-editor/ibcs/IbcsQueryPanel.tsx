"use client";

import { useEffect, useState } from "react";
import {
  Kh7Api,
  type Kh7Measure,
  type Kh7Source,
} from "@/app/(presentation-generator)/services/api/kh7";
import type { DataBinding, IbcsChartConfig } from "@/components/slide-editor/types";
import { fetchIbcsScenarioValues } from "@/components/slide-editor/ibcs/fetch";
import { parseIbcsDecimals } from "@/components/slide-editor/ibcs/format";
import {
  IBCS_KPI_PIN,
  mergeIbcsConfig,
  previousYear,
  resolveCurrentYear,
  specFromConfig,
  type IbcsScenarioValues,
} from "@/components/slide-editor/ibcs/spec";

export function IbcsQueryPanel({
  binding,
  currentYear,
  extraFilters,
  ibcs,
  onApply,
}: {
  binding?: DataBinding | null;
  currentYear?: string | null;
  extraFilters?: DataBinding["filters"];
  ibcs?: IbcsChartConfig | null;
  onApply: (payload: {
    values: IbcsScenarioValues;
    binding: DataBinding;
    ibcs: IbcsChartConfig;
    measureCaption: string;
  }) => void;
}) {
  const [sources, setSources] = useState<Kh7Source[]>([]);
  const [sourceName, setSourceName] = useState(binding?.query_id ?? "");
  const [measures, setMeasures] = useState<Kh7Measure[]>([]);
  const [measure, setMeasure] = useState(binding?.measures?.[0] ?? "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [yearInput, setYearInput] = useState(resolveCurrentYear(currentYear));
  const spec = specFromConfig(ibcs);
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
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const meta = await Kh7Api.metadata(sourceName);
        if (cancelled) return;
        setMeasures(meta.measures);
        setMeasure((current) =>
          current && meta.measures.some((item) => item.name === current)
            ? current
            : (meta.measures[0]?.name ?? ""),
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
    if (!sourceName || !measure) return;
    setLoading(true);
    setError(null);
    try {
      const meta = await Kh7Api.metadata(sourceName);
      const fetched = await fetchIbcsScenarioValues({
        source: sourceName,
        measure,
        currentYear: year,
        spec,
        knownDimensions: meta.dimensions.map((item) => item.name),
        extraFilters: (extraFilters ?? [])
          .filter((item) => (item.values?.length ?? 0) > 0)
          .map((item) => ({
            dimension: String(item.dimension || item.column || ""),
            values: (item.values ?? []).map(String),
          })),
      });
      const values = fetched.values;
      const measureMeta = meta.measures.find((item) => item.name === measure);
      const caption = measureMeta?.caption ?? measure;
      const source = sources.find((item) => item.name === sourceName);
      onApply({
        values,
        measureCaption: caption,
        ibcs: mergeIbcsConfig(ibcs, {
          kind: "kpi_pin",
          pin_vs: ibcs?.pin_vs ?? IBCS_KPI_PIN.pinVs,
          measure,
          current_year: year,
          values,
          unit: measureMeta?.unit || fetched.unit || ibcs?.unit || null,
          decimals:
            parseIbcsDecimals(measureMeta?.decimals) ??
            fetched.decimals ??
            ibcs?.decimals ??
            null,
          year_dimension: spec.yearDimension,
          version_dimension: spec.versionDimension,
          version_codes: spec.versionCodes,
        }) as IbcsChartConfig,
        binding: {
          source: "kh7",
          query_id: sourceName,
          query_name: source?.description || sourceName,
          dimensions: [spec.yearDimension],
          measures: [measure],
          filters: extraFilters ?? [],
          fetched_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo ejecutar el ratio");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-[#D6E4FF] bg-[#F0F5FF] px-3 py-2 text-[11px] text-[#2B5797]">
        Elige el informe y el ratio. El visual aplica los filtros IBCS de la
        configuración: AC AY = {year} Real ({spec.versionCodes.actual}), ΔPY ={" "}
        {previousYear(year)} Real, ΔFC = {year} Forecast (
        {spec.versionCodes.forecast}), ΔPL = {year} Plan (
        {spec.versionCodes.plan}). Dimensiones: {spec.yearDimension} /{" "}
        {spec.versionDimension}.
      </div>
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
      <label className="block text-[12px] font-medium text-[#191919]">
        Año actual
        <input
          className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] bg-white px-3 text-[12px]"
          inputMode="numeric"
          maxLength={4}
          value={yearInput}
          onChange={(event) => setYearInput(event.target.value.replace(/\D/g, "").slice(0, 4))}
        />
      </label>
      <label className="block text-[12px] font-medium text-[#191919]">
        Ratio
        <select
          className="mt-1 h-9 w-full rounded-lg border border-[#E6E6EA] bg-white px-3 text-[12px]"
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
      </label>
      {error ? <div className="text-[12px] text-[#B42318]">{error}</div> : null}
      <button
        type="button"
        className="h-9 rounded-lg bg-[#191919] px-4 text-[12px] font-semibold text-white disabled:opacity-50"
        disabled={!sourceName || !measure || loading || yearInput.length !== 4}
        onClick={() => void load()}
      >
        {loading ? "Cargando…" : "Cargar KPI"}
      </button>
    </div>
  );
}
