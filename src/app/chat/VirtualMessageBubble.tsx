import { useRef, useEffect } from "react";
import type { Message } from "@/types/message";
import { MessageBubble } from "./MessageBubble";

interface Props {
  message: Message;
  onMeasure: (id: string, height: number) => void;
}

/**
 * Wrapper around MessageBubble that reports its measured height
 * for virtual scrolling calculations.
 */
export function VirtualMessageBubble({ message, onMeasure }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ref.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          onMeasure(message.id, entry.contentRect.height);
        }
      });
      observer.observe(ref.current);
      // Initial measurement
      onMeasure(message.id, ref.current.offsetHeight);
      return () => observer.disconnect();
    }
  }, [message.id, onMeasure]);

  return (
    <div ref={ref}>
      <MessageBubble message={message} />
    </div>
  );
}
