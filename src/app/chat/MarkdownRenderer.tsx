import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeSanitize from "rehype-sanitize";
import { Copy, Check } from "lucide-react";
import { useState, type ComponentPropsWithoutRef } from "react";

interface Props {
  content: string;
}

function CodeBlock({ className, children, node, ...props }: ComponentPropsWithoutRef<"code"> & { node?: { position?: unknown; parent?: { tagName?: string } } }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className ?? "");

  // Check if this is truly inline code (not wrapped in <pre>)
  // react-markdown passes inline code without a <pre> wrapper
  const isInline = !className && typeof children === 'string' && !children.includes('\n');

  if (isInline) {
    return (
      <code
        className="px-1.5 py-0.5 bg-bg-elevated rounded text-sm font-mono text-accent-light"
        {...props}
      >
        {children}
      </code>
    );
  }

  const language = match?.[1] ?? "text";

  const handleCopy = () => {
    const text = String(children).replace(/\n$/, "");
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-3">
      <div className="flex items-center justify-between bg-bg-secondary px-3 py-1.5 rounded-t-[var(--radius-sm)] border border-b-0 border-border">
        <span className="text-xs text-text-muted font-mono">{language}</span>
        <button
          onClick={handleCopy}
          className="text-text-muted hover:text-text-primary transition-colors p-1"
          title="复制代码"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      <pre className="bg-bg-secondary p-3 rounded-b-[var(--radius-sm)] border border-t-0 border-border overflow-x-auto">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content }: Props) {
  return (
    <div className="prose prose-invert max-w-none text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight, rehypeSanitize]}
        components={{
          code: CodeBlock,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent-light underline underline-offset-2"
            >
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border bg-bg-elevated px-3 py-2 text-left font-medium text-text-secondary">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border px-3 py-2 text-text-primary">{children}</td>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-accent/50 pl-4 my-3 text-text-secondary italic">
              {children}
            </blockquote>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>
          ),
          h1: ({ children }) => (
            <h1 className="text-xl font-bold mt-6 mb-3 text-text-primary">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-semibold mt-5 mb-2 text-text-primary">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold mt-4 mb-2 text-text-primary">{children}</h3>
          ),
          p: ({ children }) => <p className="my-2">{children}</p>,
          hr: () => <hr className="border-border my-4" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
