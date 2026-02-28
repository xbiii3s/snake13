import { useState, useEffect } from "react";
import { FileText, Sparkles, Code, PenTool, BarChart3 } from "lucide-react";
import * as ipc from "@/lib/ipc";
import type { Template } from "@/lib/ipc";
import { useChatStore } from "@/stores/chatStore";

const DEFAULT_TEMPLATES = [
  { name: "General Chat", description: "Free conversation with Claude", system_prompt: "", model_id: "claude-sonnet-4-5", icon: "sparkles" },
  { name: "Code Assistant", description: "Help with coding, debugging, and code review", system_prompt: "You are an expert software engineer. Help the user with coding tasks, debugging, code review, and software design. Write clean, well-documented code with proper error handling.", model_id: "claude-sonnet-4-5", icon: "code" },
  { name: "Writing Helper", description: "Creative writing, editing, and translation", system_prompt: "You are a skilled writer and editor. Help the user with creative writing, article editing, translation, and improving their text. Be attentive to tone, style, and clarity.", model_id: "claude-sonnet-4-5", icon: "pen" },
  { name: "Data Analyst", description: "Data analysis, visualization, and insights", system_prompt: "You are a data analysis expert. Help the user analyze data, create visualizations, write SQL queries, and extract insights from datasets. Use clear explanations and concrete examples.", model_id: "claude-sonnet-4-5", icon: "chart" },
];

const iconMap: Record<string, React.ElementType> = {
  sparkles: Sparkles,
  code: Code,
  pen: PenTool,
  chart: BarChart3,
  default: FileText,
};

interface Props {
  onSelect?: () => void;
}

export function TemplatePicker({ onSelect }: Props) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const createConversation = useChatStore((s) => s.createConversation);

  useEffect(() => {
    ipc.templateList()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  const handleSelect = async (template: { name: string; system_prompt: string; model_id: string }) => {
    await createConversation({
      title: template.name,
      model_id: template.model_id,
      system_prompt: template.system_prompt || undefined,
    });
    onSelect?.();
  };

  const handleDefault = async (def: typeof DEFAULT_TEMPLATES[number]) => {
    await createConversation({
      title: def.name,
      model_id: def.model_id,
      system_prompt: def.system_prompt || undefined,
    });
    onSelect?.();
  };

  // Combine custom templates and defaults
  const allTemplates = [
    ...templates.map((t) => ({ ...t, isCustom: true })),
    ...DEFAULT_TEMPLATES.filter(
      (d) => !templates.some((t) => t.name === d.name),
    ).map((d) => ({ ...d, isCustom: false, id: d.name })),
  ];

  return (
    <div className="w-full max-w-2xl mx-auto">
      <h3 className="text-sm font-medium text-text-secondary mb-3">Start from a template</h3>
      <div className="grid grid-cols-2 gap-2">
        {allTemplates.map((tmpl) => {
          const IconComponent = iconMap[('icon' in tmpl ? tmpl.icon : undefined) ?? "default"] ?? FileText;
          return (
            <button
              key={tmpl.id ?? tmpl.name}
              onClick={() =>
                'isCustom' in tmpl && tmpl.isCustom
                  ? handleSelect(tmpl)
                  : handleDefault(tmpl as typeof DEFAULT_TEMPLATES[number])
              }
              className="flex items-start gap-3 p-3 text-left bg-bg-elevated border border-border rounded-[var(--radius-md)] hover:border-accent/50 hover:bg-bg-hover transition-all group"
            >
              <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center flex-shrink-0 group-hover:bg-accent/20 transition-colors">
                <IconComponent size={16} className="text-accent" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-text-primary truncate">{tmpl.name}</div>
                <div className="text-xs text-text-muted mt-0.5 line-clamp-2">{tmpl.description}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
