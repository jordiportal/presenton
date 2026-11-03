import { useCallback, useEffect, useRef } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { notify } from "@/components/ui/sonner";
import { setPresentationData } from "@/store/slices/presentationGeneration";
import { clearHistory } from "@/store/slices/undoRedoSlice";
import { applyPresentationThemeToElement } from "../utils/applyPresentationThemeDom";
import { normalizeBackendAssetUrls } from "@/utils/api";
import { withEmbedParams } from "@/utils/embed";
import { useFontLoader } from "../../hooks/useFontLoad";
import { DashboardApi } from "../../services/api/dashboard";
import TemplateService from "../../services/api/template";
import {
  DEFAULT_TEMPLATE_THEME,
  normalizeTemplateTheme,
  resolveTemplateIdFromPresentation,
} from "@/lib/template-theme";


// La generación async solo guarda el deck al final (varios minutos).
const PENDING_DECK_POLL_MS = 4_000;
const PENDING_DECK_MAX_WAIT_MS = 20 * 60_000;

/** Creado con `/presentation/create` y aún sin esquema: le toca la pantalla de outline. */
const isAwaitingOutline = (data: any): boolean =>
  !!data &&
  data.type !== "smart" &&
  !data.outlines &&
  Array.isArray(data.slides) &&
  data.slides.length === 0;

export const usePresentationData = (
  presentationId: string,
  setLoading: (loading: boolean) => void,
  setError: (error: boolean) => void,
  onAwaitingGeneration?: (waiting: boolean) => void
) => {
  const dispatch = useDispatch();
  const router = useRouter();
  const pendingSinceRef = useRef<number | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (pendingTimerRef.current) clearTimeout(pendingTimerRef.current);
    },
    []
  );

  const fetchUserSlides = useCallback(async (options?: { clearHistory?: boolean }): Promise<any> => {
    try {
      const data = await DashboardApi.getPresentation(presentationId, {
        cache: "no-store",
      });
      if (pendingSinceRef.current !== null) {
        pendingSinceRef.current = null;
        onAwaitingGeneration?.(false);
      }

      if (isAwaitingOutline(data)) {
        router.replace(withEmbedParams(`/outline?id=${presentationId}`));
        return undefined;
      }

      if (data?.version === "v1-standard") {
        notify.warning(
          "Unsupported presentation",
          "This deck was created in an older Presenton version. Downgrade to a compatible version to open it."
        );
        setLoading(false);
        router.replace("/dashboard");
        return undefined;
      }

      const normalizedData = normalizeBackendAssetUrls(data);


      if (normalizedData) {
        const templateId = resolveTemplateIdFromPresentation(normalizedData);
        const responseTheme = normalizeTemplateTheme(normalizedData.theme);
        const fetchedTheme = templateId
          ? await TemplateService.getTemplateTheme(templateId)
          : null;
        const theme = fetchedTheme ?? responseTheme ?? DEFAULT_TEMPLATE_THEME;
        const themedData = {
          ...normalizedData,
          ...(templateId && !normalizedData.template_id
            ? { template_id: templateId }
            : {}),
          theme,
        };

        dispatch(setPresentationData(themedData));
        if (options?.clearHistory ?? true) {
          dispatch(clearHistory());
        }
        setLoading(false);
        if (normalizedData.fonts) {
          useFontLoader(normalizedData.fonts);
        }
        const textFont = theme.fonts?.textFont;
        if (textFont) {
          useFontLoader({ [textFont.name]: textFont.url });
        }
        const el = document.getElementById("presentation-slides-wrapper");
        applyPresentationThemeToElement(el, theme);
        return themedData;
      }

      return normalizedData;
    } catch (error) {
      if ((error as { status?: number })?.status === 404) {
        const now = Date.now();
        pendingSinceRef.current ??= now;
        if (now - pendingSinceRef.current < PENDING_DECK_MAX_WAIT_MS) {
          onAwaitingGeneration?.(true);
          pendingTimerRef.current = setTimeout(() => {
            void fetchUserSlides(options);
          }, PENDING_DECK_POLL_MS);
          return undefined;
        }
        pendingSinceRef.current = null;
        onAwaitingGeneration?.(false);
      }
      setError(true);
      notify.error("Failed to load presentation", "The presentation could not be loaded. Please try again.");
      console.error("Error fetching user slides:", error);
      setLoading(false);
      return undefined;
    }
  }, [presentationId, dispatch, router, setLoading, setError, onAwaitingGeneration]);

  return {
    fetchUserSlides,
  };
};
