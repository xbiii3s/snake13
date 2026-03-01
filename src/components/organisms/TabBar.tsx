import { useTabStore } from "@/stores/tabStore";
import { useChatStore } from "@/stores/chatStore";
import { X, Plus } from "lucide-react";
import { cn } from "@/lib/cn";

export function TabBar() {
  const tabs = useTabStore((s) => s.tabs);
  const activeTabId = useTabStore((s) => s.activeTabId);
  const setActiveTab = useTabStore((s) => s.setActiveTab);
  const closeTab = useTabStore((s) => s.closeTab);

  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const createConversation = useChatStore((s) => s.createConversation);
  const openTab = useTabStore((s) => s.openTab);

  if (tabs.length === 0) return null;

  const handleTabClick = (tab: (typeof tabs)[0]) => {
    setActiveTab(tab.id);
    setActiveConversation(tab.conversationId);
  };

  const handleNewTab = async () => {
    const id = await createConversation();
    openTab(id, "新对话");
  };

  return (
    <div className="flex items-center gap-0.5 px-2 bg-bg-secondary border-b border-border overflow-x-auto">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => handleTabClick(tab)}
          className={cn(
            "group flex items-center gap-1.5 px-3 py-1.5 text-xs cursor-pointer border-b-2 transition-colors max-w-[180px]",
            activeTabId === tab.id
              ? "border-accent text-text-primary bg-bg-primary"
              : "border-transparent text-text-muted hover:text-text-secondary hover:bg-bg-hover",
          )}
        >
          <span className="truncate">{tab.title}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-bg-hover rounded transition-all"
          >
            <X size={10} />
          </button>
        </div>
      ))}
      <button
        onClick={handleNewTab}
        className="p-1.5 text-text-muted hover:text-text-secondary hover:bg-bg-hover rounded transition-colors ml-1"
        title="新标签页"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
