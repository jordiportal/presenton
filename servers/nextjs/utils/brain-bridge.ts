import { isEmbedView } from "@/utils/embed";

export const BRAIN_PRESENTON_CHANNEL = "brain.presenton";

export type BrainPresentonAsk = {
  channel: typeof BRAIN_PRESENTON_CHANNEL;
  type: "ask";
  text: string;
};

export type BrainPresentonRefresh = {
  channel: typeof BRAIN_PRESENTON_CHANNEL;
  type: "refresh";
};

export function isBrainPresentonMessage(
  data: unknown
): data is BrainPresentonAsk | BrainPresentonRefresh {
  if (!data || typeof data !== "object") return false;
  const raw = data as { channel?: unknown; type?: unknown };
  return (
    raw.channel === BRAIN_PRESENTON_CHANNEL &&
    (raw.type === "ask" || raw.type === "refresh")
  );
}

function presentationIdFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("id")?.trim() || null;
}

/**
 * Caja "Pedir a Brain" del iframe: el pedido es un turno del chat de Brain.
 * Devuelve true si el pedido salió al padre.
 */
export function askBrain(
  instruction: string,
  extras?: { slideIndex?: number; slideId?: string }
): boolean {
  const text = instruction.trim();
  if (!text) return false;
  if (typeof window === "undefined" || !isEmbedView()) return false;
  if (window.parent === window) return false;

  const deckId = presentationIdFromUrl();
  const lines = [
    deckId
      ? `El usuario edita el deck Presenton \`${deckId}\` en el iframe (handler=presenton).`
      : "El usuario edita un deck Presenton en el iframe (handler=presenton).",
  ];
  if (extras?.slideIndex != null) {
    const slideId = extras.slideId ? ` (id ${extras.slideId})` : "";
    lines.push(`Slide visible: índice ${extras.slideIndex}${slideId}.`);
  }
  lines.push(`Pedido: ${text}`);
  lines.push(
    "Carga la capability presentation_presenton. No regeneres el deck: lee (presenton_deck_get_slide_at_index) y retoca con presenton_deck_*. Imágenes y vídeo con el motor de Presenton (presenton_deck_generate_assets, presenton_animate_image_async), nunca generate_image. Usa el external_id del artefacto como presentation_id."
  );

  const payload: BrainPresentonAsk = {
    channel: BRAIN_PRESENTON_CHANNEL,
    type: "ask",
    text: lines.join("\n"),
  };
  window.parent.postMessage(payload, "*");
  return true;
}
