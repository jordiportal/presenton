import { NextResponse } from "next/server";
import {
  resolveRuntimeProviderConfig,
  sanitizeRuntimeConfig,
} from "@/lib/runtime-provider-config";
import { authStatusForRequest } from "@/lib/server-auth-role";
import { readUserConfigFile } from "@/lib/user-config-store";
import { LLMConfig } from "@/types/llm_config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await authStatusForRequest(request);
  if (!auth.authenticated) {
    return NextResponse.json({ detail: "Unauthorized" }, { status: 401 });
  }
  try {
    const fromApi = await resolveRuntimeProviderConfig(request);
    if (fromApi.configured || Object.keys(fromApi.config).length) {
      return NextResponse.json(fromApi);
    }
    const path = process.env.USER_CONFIG_PATH;
    if (!path) {
      return NextResponse.json(fromApi);
    }
    const fileConfig = readUserConfigFile<LLMConfig>(path) || {};
    return NextResponse.json(sanitizeRuntimeConfig(fileConfig));
  } catch {
    return NextResponse.json(
      { configured: false, config: {} },
      { status: 200 }
    );
  }
}
