import { getFastApiAuthHeaders, getFastApiBaseUrl } from "@/lib/fastapi-internal";

export async function embedExportVideos(params: {
  presentationId: string;
  pptxPath: string;
  cookieHeader?: string;
}): Promise<number> {
  const response = await fetch(
    `${getFastApiBaseUrl()}/api/v1/ppt/presentation/${params.presentationId}/export/embed-videos`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(params.cookieHeader ? { Cookie: params.cookieHeader } : {}),
        ...getFastApiAuthHeaders(),
      },
      body: JSON.stringify({ path: params.pptxPath }),
      cache: "no-store",
    },
  );
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `Failed to embed videos into PPTX (${response.status}): ${detail}`,
    );
  }
  const payload = (await response.json()) as { embedded?: number };
  return typeof payload.embedded === "number" ? payload.embedded : 0;
}
