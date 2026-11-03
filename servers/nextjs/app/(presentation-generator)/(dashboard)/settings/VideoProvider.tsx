import React, { useState } from 'react'
import { Clapperboard, Eye, EyeOff } from 'lucide-react'
import { LLMConfig } from '@/types/llm_config'
import MediaModelsField from './MediaModelsField'

const inputClass = "w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"

const VideoProvider = ({ llmConfig, setLlmConfig }: { llmConfig: LLMConfig, setLlmConfig: (config: any) => void }) => {
    const [showApiKey, setShowApiKey] = useState(false);
    const imageBaseUrl = llmConfig.OPENAI_COMPAT_IMAGE_BASE_URL || "";
    const baseUrl = llmConfig.OPENAI_COMPAT_VIDEO_BASE_URL || imageBaseUrl;
    const apiKey = llmConfig.OPENAI_COMPAT_VIDEO_API_KEY || llmConfig.OPENAI_COMPAT_IMAGE_API_KEY || "";
    const gatewayMissing = !baseUrl.trim() || !apiKey.trim();

    const setField = (field: keyof LLMConfig, value: string) => {
        setLlmConfig((prev: any) => ({ ...prev, [field]: value }));
    };

    return (
        <div className="space-y-6 bg-[#F9F8F8] p-7 rounded-[12px]">
            <div className="bg-white p-10 pt-6 rounded-[12px] flex items-start justify-between gap-8">
                <div className="max-w-[290px]">
                    <div className="w-[60px] h-[60px] rounded-[4px] flex items-center justify-center bg-[#F4F3FF]">
                        <Clapperboard className="w-7 h-7 text-[#5146E5]" />
                    </div>
                    <h3 className="text-xl font-normal text-[#191919] py-2.5">Video Generation Settings</h3>
                    <p className="text-sm text-gray-500">
                        Animate slide images into short clips through an OpenAI-compatible
                        <code className="mx-1 rounded bg-gray-100 px-1 py-0.5 text-xs">/v1/videos</code>
                        gateway (LiteLLM).
                    </p>
                </div>
                <div className="w-[300px] space-y-4">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">Gateway URL</label>
                        <input
                            type="text"
                            className={inputClass}
                            placeholder={imageBaseUrl ? `Same as images (${imageBaseUrl})` : "https://gateway/v1"}
                            value={llmConfig.OPENAI_COMPAT_VIDEO_BASE_URL || ""}
                            onChange={(e) => setField("OPENAI_COMPAT_VIDEO_BASE_URL", e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-700">API key</label>
                        <div className="relative">
                            <input
                                type={showApiKey ? 'text' : 'password'}
                                className={`${inputClass} pr-12`}
                                placeholder={llmConfig.OPENAI_COMPAT_IMAGE_API_KEY ? "Same as images" : "Gateway API key"}
                                value={llmConfig.OPENAI_COMPAT_VIDEO_API_KEY || ""}
                                onChange={(e) => setField("OPENAI_COMPAT_VIDEO_API_KEY", e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => setShowApiKey((prev) => !prev)}
                                className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-gray-500 hover:text-gray-700"
                                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                            >
                                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>
                        <p className="mt-1.5 text-xs text-gray-500">
                            Leave both empty to reuse the image gateway.
                        </p>
                    </div>
                </div>
            </div>

            {gatewayMissing ? (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                    Set a gateway URL and key here or in Image Provider (OpenAI compatible) to enable video.
                </div>
            ) : null}

            <MediaModelsField
                title="Video models"
                description="The default model animates images. Enable alternatives so users (and Khai) can pick another model when animating."
                baseUrl={baseUrl}
                apiKey={apiKey}
                defaultModel={llmConfig.OPENAI_COMPAT_VIDEO_MODEL || ""}
                alternatives={llmConfig.OPENAI_COMPAT_VIDEO_ALT_MODELS || ""}
                placeholder="e.g. atlas/kling-v2"
                onChange={({ defaultModel, alternatives }) => {
                    setLlmConfig((prev: any) => ({
                        ...prev,
                        OPENAI_COMPAT_VIDEO_MODEL: defaultModel,
                        OPENAI_COMPAT_VIDEO_ALT_MODELS: alternatives,
                    }));
                }}
            />
        </div>
    )
}

export default VideoProvider
