import { getFastApiBaseUrl } from "@/lib/fastapi-internal";
import { outboundAuthHeaders } from "@/lib/server-auth-role";
import { LLMConfig } from "@/types/llm_config";
import { hasValidLLMConfig, normalizeLLMConfig } from "@/utils/storeHelpers";

const SECRET_FIELD = /(API_KEY|ACCESS_KEY|SECRET|TOKEN|PASSWORD)/i;

export type RuntimeProviderConfig = {
  configured: boolean;
  config: LLMConfig;
};

function maskSecrets(config: Record<string, unknown>): LLMConfig {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      SECRET_FIELD.test(key) ? (value ? "__configured__" : "") : value,
    ])
  ) as LLMConfig;
}

function envFallbackConfig(): LLMConfig {
  const raw: Record<string, string> = {};
  for (const key of [
    "LLM",
    "CUSTOM_LLM_URL",
    "CUSTOM_MODEL",
    "DISABLE_IMAGE_GENERATION",
    "IMAGE_PROVIDER",
    "LLM_REASONING_EFFORT",
    "LLM_MAX_OUTPUT_TOKENS",
  ]) {
    const value = process.env[key];
    if (value) raw[key] = value;
  }
  if (process.env.CUSTOM_LLM_API_KEY) {
    raw.CUSTOM_LLM_API_KEY = "__configured__";
  }
  return normalizeLLMConfig(raw as LLMConfig);
}

export function sanitizeRuntimeConfig(config: LLMConfig): RuntimeProviderConfig {
  const full = normalizeLLMConfig(config);
  return {
    configured: hasValidLLMConfig(full),
    config: maskSecrets(full as Record<string, unknown>),
  };
}

export async function fetchFastApiRuntimeConfig(
  request: Request
): Promise<RuntimeProviderConfig | null> {
  try {
    const response = await fetch(
      `${getFastApiBaseUrl()}/api/v1/auth/runtime-config`,
      {
        headers: outboundAuthHeaders(request),
        cache: "no-store",
      }
    );
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      configured?: boolean;
      config?: LLMConfig;
    };
    const config = normalizeLLMConfig(payload.config || {});
    return {
      configured:
        typeof payload.configured === "boolean"
          ? payload.configured
          : hasValidLLMConfig(config),
      config,
    };
  } catch {
    return null;
  }
}

export async function resolveRuntimeProviderConfig(
  request: Request
): Promise<RuntimeProviderConfig> {
  const fromApi = await fetchFastApiRuntimeConfig(request);
  if (fromApi && (fromApi.configured || Object.keys(fromApi.config).length)) {
    return fromApi;
  }
  return sanitizeRuntimeConfig(envFallbackConfig());
}
