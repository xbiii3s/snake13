import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { Message } from "@/types/message";

/**
 * Virtual scrolling hook for long conversation performance.
 *
 * Strategy: render only messages within the visible viewport + buffer.
 * When message count is small (< threshold), render everything normally.
 * When message count exceeds threshold, virtualize to keep DOM light.
 */
const VIRTUALIZE_THRESHOLD = 50;
const BUFFER_SIZE = 10; // extra messages above/below viewport
const ESTIMATED_MESSAGE_HEIGHT = 120; // px, rough estimate

interface VirtualRange {
  start: number;
  end: number;
  topPadding: number;
  bottomPadding: number;
}

export function useVirtualMessages(
  messages: Message[],
  scrollRef: React.RefObject<HTMLDivElement | null>,
) {
  const [range, setRange] = useState<VirtualRange>({
    start: 0,
    end: messages.length,
    topPadding: 0,
    bottomPadding: 0,
  });

  // Track measured heights for better estimates
  const heightsRef = useRef<Map<string, number>>(new Map());
  const shouldVirtualize = messages.length > VIRTUALIZE_THRESHOLD;

  const getEstimatedHeight = useCallback(
    (msgId: string) => {
      return heightsRef.current.get(msgId) ?? ESTIMATED_MESSAGE_HEIGHT;
    },
    [],
  );

  const measureMessage = useCallback((msgId: string, height: number) => {
    heightsRef.current.set(msgId, height);
  }, []);

  // Recalculate visible range on scroll
  const updateRange = useCallback(() => {
    if (!shouldVirtualize || !scrollRef.current) {
      setRange((prev) => {
        if (prev.start === 0 && prev.end === messages.length && prev.topPadding === 0 && prev.bottomPadding === 0) {
          return prev; // no change — avoid unnecessary re-render
        }
        return { start: 0, end: messages.length, topPadding: 0, bottomPadding: 0 };
      });
      return;
    }

    const container = scrollRef.current;
    const scrollTop = container.scrollTop;
    const viewportHeight = container.clientHeight;

    // Calculate which messages are visible
    let cumulativeHeight = 0;
    let startIdx = 0;
    let endIdx = messages.length;

    // Find start index
    for (let i = 0; i < messages.length; i++) {
      const h = getEstimatedHeight(messages[i]!.id);
      if (cumulativeHeight + h >= scrollTop) {
        startIdx = Math.max(0, i - BUFFER_SIZE);
        break;
      }
      cumulativeHeight += h;
    }

    // Find end index
    cumulativeHeight = 0;
    for (let i = 0; i < messages.length; i++) {
      cumulativeHeight += getEstimatedHeight(messages[i]!.id);
      if (cumulativeHeight >= scrollTop + viewportHeight) {
        endIdx = Math.min(messages.length, i + BUFFER_SIZE + 1);
        break;
      }
    }

    // Calculate padding
    let topPadding = 0;
    for (let i = 0; i < startIdx; i++) {
      topPadding += getEstimatedHeight(messages[i]!.id);
    }

    let bottomPadding = 0;
    for (let i = endIdx; i < messages.length; i++) {
      bottomPadding += getEstimatedHeight(messages[i]!.id);
    }

    setRange({ start: startIdx, end: endIdx, topPadding, bottomPadding });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldVirtualize, messages.length, scrollRef, getEstimatedHeight]);

  // Listen to scroll events
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !shouldVirtualize) return;

    let rafId: number;
    const onScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateRange);
    };

    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId);
    };
  }, [scrollRef, shouldVirtualize, updateRange]);

  // Re-calculate when messages change
  useEffect(() => {
    updateRange();
  }, [messages.length, updateRange]);

  const visibleMessages = useMemo(() => {
    if (!shouldVirtualize) return messages;
    return messages.slice(range.start, range.end);
  }, [messages, shouldVirtualize, range.start, range.end]);

  return {
    visibleMessages,
    topPadding: shouldVirtualize ? range.topPadding : 0,
    bottomPadding: shouldVirtualize ? range.bottomPadding : 0,
    measureMessage,
    isVirtualized: shouldVirtualize,
    totalCount: messages.length,
    renderedCount: visibleMessages.length,
  };
}
