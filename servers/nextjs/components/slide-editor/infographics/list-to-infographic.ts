import type {
  InfographicData,
  InfographicElement,
  InfographicIcon,
  InfographicType,
  TextListElement,
  TimelineInfographicItem,
} from "@/components/slide-editor/types";

export const LIST_INFOGRAPHIC_TYPES = [
  "pyramid",
  "conversion_funnel",
  "staircase",
  "chevron_process",
  "stair_step_blocks",
  "radial_cycle",
  "timeline",
  "segmented_wheel",
] as const satisfies readonly InfographicType[];

export type ListInfographicType = (typeof LIST_INFOGRAPHIC_TYPES)[number];

export const LIST_INFOGRAPHIC_OPTIONS: Array<{
  type: ListInfographicType;
  label: string;
}> = [
  { type: "pyramid", label: "Pyramid" },
  { type: "conversion_funnel", label: "Funnel" },
  { type: "staircase", label: "Staircase" },
  { type: "chevron_process", label: "Steps" },
  { type: "stair_step_blocks", label: "Step Blocks" },
  { type: "radial_cycle", label: "Cycle" },
  { type: "timeline", label: "Timeline" },
  { type: "segmented_wheel", label: "Wheel" },
];

const DEFAULT_COLORS = [
  "FFFFFF",
  "102E79",
  "24468E",
  "385EAA",
  "4D73BE",
  "6388D0",
  "7CA2E5",
  "9DC2ED",
];
const DEFAULT_ICON_URLS = [
  "/static/icons/bold/binoculars-bold.svg",
  "/static/icons/bold/target-bold.svg",
  "/static/icons/bold/wrench-bold.svg",
  "/static/icons/bold/megaphone-bold.svg",
  "/static/icons/bold/chart-line-up-bold.svg",
];
const DEFAULT_SIZES: Record<
  ListInfographicType,
  { width: number; height: number }
> = {
  pyramid: { width: 720, height: 400 },
  conversion_funnel: { width: 720, height: 320 },
  staircase: { width: 720, height: 340 },
  chevron_process: { width: 720, height: 240 },
  stair_step_blocks: { width: 720, height: 280 },
  radial_cycle: { width: 560, height: 520 },
  timeline: { width: 720, height: 260 },
  segmented_wheel: { width: 560, height: 460 },
};
const MAX_ITEMS = 8;
const FRAME_MARGIN = 12;
const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;

export type ListInfographicItem = {
  heading: string;
  description?: string | null;
  value?: number | null;
  icon?: InfographicIcon | null;
};

export function isListInfographicType(
  value: string,
): value is ListInfographicType {
  return (LIST_INFOGRAPHIC_TYPES as readonly string[]).includes(value);
}

export function listItemsFromTextList(
  element: Pick<TextListElement, "items">,
): ListInfographicItem[] {
  const items = Array.isArray(element.items) ? element.items : [];
  return items
    .map((item) => parseListItemText(listItemText(item)))
    .filter((item): item is ListInfographicItem => Boolean(item.heading))
    .slice(0, MAX_ITEMS);
}

export function convertTextListToInfographic(
  list: TextListElement,
  infographicType: ListInfographicType,
): InfographicElement | null {
  const items = listItemsFromTextList(list);
  if (items.length === 0) return null;

  return infographicFromListItems(infographicType, items, {
    position: list.position,
    colors: DEFAULT_COLORS.slice(0, Math.max(2, items.length + 1)),
    text_color: hexColor(list.font?.color) ?? "111111",
  });
}

export function listItemsFromInfographic(
  data: unknown,
): ListInfographicItem[] {
  const record = asRecord(data);
  const items = Array.isArray(record?.items) ? record.items : [];
  return items
    .map((item) => infographicItemFromUnknown(item))
    .filter((item): item is ListInfographicItem => Boolean(item?.heading))
    .slice(0, MAX_ITEMS);
}

export function convertInfographicToListType(
  element: {
    position?: { x: number; y: number } | null;
    data?: unknown;
    colors?: string[];
    text_color?: string | null;
    decorative?: boolean | null;
  },
  infographicType: ListInfographicType,
): InfographicElement | null {
  const currentType = asRecord(element.data)?.type;
  if (currentType === infographicType) return null;
  const items = listItemsFromInfographic(element.data);
  if (items.length === 0) return null;

  return infographicFromListItems(infographicType, items, {
    position: element.position,
    colors: Array.isArray(element.colors) ? element.colors : undefined,
    text_color: element.text_color ?? "111111",
    decorative: element.decorative,
  });
}

export function infographicDataFromListItems(
  infographicType: ListInfographicType,
  items: ListInfographicItem[],
): InfographicData {
  if (infographicType === "conversion_funnel") {
    return {
      type: "conversion_funnel",
      items: items.map((item, index) => ({
        heading: item.heading,
        description: item.description ?? null,
        value: item.value ?? funnelValue(index, items.length),
      })),
    };
  }

  const mapped = items.map((item, index) => timelineItem(item, index));
  if (infographicType === "radial_cycle") {
    return {
      type: "radial_cycle",
      center_image: null,
      items: mapped,
    };
  }

  return {
    type: infographicType,
    items: mapped,
  };
}

export function parseListItemText(raw: string): ListInfographicItem {
  const cleaned = raw
    .replace(/^[•●○◦\-\u2013\u2014*]+\s*/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return { heading: "" };

  const leadingValue = cleaned.match(/^(\d+(?:[.,]\d+)?)\s*%?\s+(.+)$/u);
  const value = leadingValue ? parseLocaleNumber(leadingValue[1]) : null;
  const body = leadingValue ? leadingValue[2] : cleaned;

  const colon = body.match(/^(.{2,48}?)[:\u2013\u2014-]\s+(.+)$/u);
  if (colon) {
    return {
      heading: colon[1].trim(),
      description: colon[2].trim(),
      value,
    };
  }

  const sentence = body.match(/^(.{2,72}?[.!?])\s+(.+)$/u);
  if (sentence && sentence[2].trim().length > 8) {
    return {
      heading: sentence[1].replace(/[.!?]+$/u, "").trim(),
      description: sentence[2].trim(),
      value,
    };
  }

  if (body.length > 72) {
    const words = body.split(" ");
    return {
      heading: words.slice(0, 6).join(" "),
      description: words.slice(6).join(" "),
      value,
    };
  }

  return {
    heading: body.replace(/[.!?]+$/u, "").trim(),
    description: null,
    value,
  };
}

function infographicFromListItems(
  infographicType: ListInfographicType,
  items: ListInfographicItem[],
  source: {
    position?: { x: number; y: number } | null;
    colors?: string[];
    text_color?: string | null;
    decorative?: boolean | null;
  },
): InfographicElement {
  const size = sizeFor(infographicType, items.length);
  return {
    type: "infographic",
    position: containedPosition(
      {
        x: source.position?.x ?? FRAME_MARGIN,
        y: source.position?.y ?? FRAME_MARGIN,
      },
      size,
    ),
    size,
    data: infographicDataFromListItems(infographicType, items),
    colors:
      source.colors && source.colors.length > 0
        ? source.colors
        : DEFAULT_COLORS.slice(0, Math.max(2, items.length + 1)),
    text_color: source.text_color ?? "111111",
    decorative: source.decorative ?? false,
    name: infographicType,
  };
}

function infographicItemFromUnknown(value: unknown): ListInfographicItem | null {
  const record = asRecord(value);
  if (!record) return null;
  const heading =
    typeof record.heading === "string"
      ? record.heading.trim()
      : typeof record.label === "string"
        ? record.label.trim()
        : "";
  if (!heading) return null;
  return {
    heading,
    description:
      typeof record.description === "string" ? record.description : null,
    value:
      typeof record.value === "number" && Number.isFinite(record.value)
        ? record.value
        : null,
    icon: readIcon(record.icon),
  };
}

function timelineItem(
  item: ListInfographicItem,
  index: number,
): TimelineInfographicItem {
  return {
    icon: item.icon ?? defaultIcon(index),
    heading: item.heading,
    description: item.description ?? null,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readIcon(value: unknown): InfographicIcon | null {
  const record = asRecord(value);
  if (!record || typeof record.url !== "string" || !record.url) return null;
  return {
    url: record.url,
    color: typeof record.color === "string" ? record.color : "FFFFFF",
  };
}

function defaultIcon(index: number): InfographicIcon {
  return {
    url: DEFAULT_ICON_URLS[Math.max(0, index) % DEFAULT_ICON_URLS.length],
    color: "FFFFFF",
  };
}

function listItemText(item: unknown): string {
  if (typeof item === "string") return item;
  if (Array.isArray(item)) {
    return item.map(runText).join("");
  }
  if (item == null || typeof item !== "object") return "";
  const record = item as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  return Array.isArray(record.runs) ? record.runs.map(runText).join("") : "";
}

function runText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null || typeof value !== "object") return "";
  const record = value as Record<string, unknown>;
  return typeof record.text === "string" ? record.text : "";
}

function sizeFor(type: ListInfographicType, itemCount: number) {
  const base = DEFAULT_SIZES[type];
  const extra = Math.max(0, itemCount - 4) * 36;
  return {
    width: base.width,
    height: base.height + extra,
  };
}

function funnelValue(index: number, total: number) {
  if (total <= 1) return 100;
  return Math.max(8, Math.round(100 * (1 - index / (total + 0.35))));
}

function parseLocaleNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function hexColor(value: string | null | undefined) {
  if (!value) return null;
  const hex = value.trim().replace(/^#/, "");
  return /^[0-9a-fA-F]{3,8}$/.test(hex) ? hex.toUpperCase() : null;
}

function containedPosition(
  position: { x: number; y: number },
  size: { width: number; height: number },
) {
  return {
    x: clamp(
      position.x,
      FRAME_MARGIN,
      Math.max(FRAME_MARGIN, STAGE_WIDTH - size.width - FRAME_MARGIN),
    ),
    y: clamp(
      position.y,
      FRAME_MARGIN,
      Math.max(FRAME_MARGIN, STAGE_HEIGHT - size.height - FRAME_MARGIN),
    ),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
