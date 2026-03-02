import { useState } from "react";
import { X, Code2, Image, FileText, Maximize2, Minimize2, Copy, Check } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/cn";

export interface Artifact {
  id: string;
  type: "code" | "html" | "svg" | "markdown";
  title: string;
  content: string;
  language?: string;
}

interface Props {
  artifact: Artifact | null;
}

export function ArtifactPanel({ artifact }: Props) {
  const toggleArtifactPanel = useUIStore((s) => s.toggleArtifactPanel);
  const [maximized, setMaximized] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!artifact) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(artifact.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write failed silently
    }
  };

  const typeIcon = {
    code: <Code2 size={14} />,
    html: <FileText size={14} />,
    svg: <Image size={14} />,
    markdown: <FileText size={14} />,
  }[artifact.type];

  return (
    <aside
      className={cn(
        "bg-bg-secondary border-l border-border flex flex-col flex-shrink-0 transition-all",
        maximized ? "w-[60%]" : "w-[400px]",
      )}
    >
      {/* Header */}
      <div className="h-[52px] flex items-center justify-between px-4 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
          {typeIcon}
          <span className="truncate max-w-[200px]">{artifact.title}</span>
          <span className="text-xs text-text-muted bg-bg-elevated px-1.5 py-0.5 rounded">
            {artifact.type}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopy}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            title="复制"
          >
            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
          </button>
          <button
            onClick={() => setMaximized(!maximized)}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            title={maximized ? "最小化" : "最大化"}
          >
            {maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            onClick={toggleArtifactPanel}
            className="p-1.5 text-text-muted hover:text-text-primary transition-colors"
            title="关闭"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {artifact.type === "html" ? (
          <iframe
            srcDoc={artifact.content}
            title={artifact.title}
            className="w-full h-full border-0 bg-white"
            sandbox=""
          />
        ) : artifact.type === "svg" ? (
          <iframe
            srcDoc={`<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#fff">${artifact.content}</body></html>`}
            title={artifact.title}
            className="w-full h-full border-0"
            sandbox=""
          />
        ) : (
          <pre className="p-4 text-xs font-mono text-text-primary overflow-auto whitespace-pre-wrap leading-relaxed">
            <code>{artifact.content}</code>
          </pre>
        )}
      </div>
    </aside>
  );
}
