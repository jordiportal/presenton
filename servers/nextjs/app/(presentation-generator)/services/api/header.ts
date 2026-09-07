import { embedAuthHeaders } from "@/utils/embed";
import { getEditorSessionId } from "../../presentation/utils/editorSession";

export const getHeader = () => {
  const sessionId = getEditorSessionId();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",  
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Presenton-Session",
    ...(sessionId ? { "X-Presenton-Session": sessionId } : {}),
    ...embedAuthHeaders(),
  };
};

export const getHeaderForFormData = () => {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...embedAuthHeaders(),
  };
};
