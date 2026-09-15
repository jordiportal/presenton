"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  parsePresentSessionMessage,
  presentChannelName,
  type PresentSessionMessage,
} from "../utils/presentSession";

export function usePresentSessionSync({
  presentationId,
  enabled,
  currentIndex,
  onRemoteSlide,
  onRemoteSlideUi,
  onRemoteExit,
}: {
  presentationId: string;
  enabled: boolean;
  currentIndex: number;
  onRemoteSlide: (index: number) => void;
  onRemoteSlideUi?: (index: number, ui: Record<string, unknown>) => void;
  onRemoteExit: () => void;
}) {
  const currentIndexRef = useRef(currentIndex);
  const onRemoteSlideRef = useRef(onRemoteSlide);
  const onRemoteSlideUiRef = useRef(onRemoteSlideUi);
  const onRemoteExitRef = useRef(onRemoteExit);
  const channelRef = useRef<BroadcastChannel | null>(null);

  currentIndexRef.current = currentIndex;
  onRemoteSlideRef.current = onRemoteSlide;
  onRemoteSlideUiRef.current = onRemoteSlideUi;
  onRemoteExitRef.current = onRemoteExit;

  useEffect(() => {
    if (!enabled || !presentationId || typeof BroadcastChannel === "undefined") {
      return;
    }
    const channel = new BroadcastChannel(presentChannelName(presentationId));
    channelRef.current = channel;
    channel.onmessage = (event) => {
      const message = parsePresentSessionMessage(event.data);
      if (!message) return;
      if (message.type === "slide") {
        if (message.index !== currentIndexRef.current) {
          onRemoteSlideRef.current(message.index);
        }
        return;
      }
      if (message.type === "slide-ui") {
        onRemoteSlideUiRef.current?.(message.index, message.ui);
        return;
      }
      onRemoteExitRef.current();
    };
    return () => {
      channel.close();
      if (channelRef.current === channel) {
        channelRef.current = null;
      }
    };
  }, [enabled, presentationId]);

  const postSlide = useCallback((index: number) => {
    const message: PresentSessionMessage = { type: "slide", index };
    channelRef.current?.postMessage(message);
  }, []);

  const postSlideUi = useCallback(
    (index: number, ui: Record<string, unknown>) => {
      const message: PresentSessionMessage = { type: "slide-ui", index, ui };
      channelRef.current?.postMessage(message);
    },
    [],
  );

  const postExit = useCallback(() => {
    const message: PresentSessionMessage = { type: "exit" };
    channelRef.current?.postMessage(message);
  }, []);

  return { postSlide, postSlideUi, postExit };
}
