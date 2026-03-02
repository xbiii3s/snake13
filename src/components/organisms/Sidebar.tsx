import { useEffect, useState, useMemo, useCallback } from "react";
import { useChatStore } from "@/stores/chatStore";
import { useTabStore } from "@/stores/tabStore";
import {
  Plus, Search, MessageSquare, Trash2, Pin, FolderOpen, FolderPlus,
  Download, Upload, MoreHorizontal, ChevronRight, ChevronDown, Home,
} from "lucide-react";
import { cn } from "@/lib/cn";
import * as ipc from "@/lib/ipc";
import type { Folder } from "@/lib/ipc";

export function Sidebar() {
  const conversations = useChatStore((s) => s.conversations);
  const activeId = useChatStore((s) => s.activeConversationId);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const setActiveConversation = useChatStore((s) => s.setActiveConversation);
  const clearActiveConversation = useChatStore((s) => s.clearActiveConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const openTab = useTabStore((s) => s.openTab);
  const clearActiveTab = useTabStore((s) => s.clearActiveTab);

  const [searchQuery, setSearchQuery] = useState("");
  const [folders, setFolders] = useState<Folder[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [showActions, setShowActions] = useState<string | null>(null);

  // Close context menu on outside click
  useEffect(() => {
    if (!showActions) return;
    const handleClickOutside = () => setShowActions(null);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [showActions]);

  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations;
    const q = searchQuery.toLowerCase();
    return conversations.filter((c) => c.title.toLowerCase().includes(q));
  }, [conversations, searchQuery]);

  // Separate conversations into folders vs unfiled
  const unfiledConversations = useMemo(
    () => filteredConversations.filter((c) => !c.folder_id),
    [filteredConversations],
  );

  const folderConversations = useMemo(() => {
    const map = new Map<string, typeof conversations>();
    for (const c of filteredConversations) {
      if (c.folder_id) {
        const list = map.get(c.folder_id) ?? [];
        list.push(c);
        map.set(c.folder_id, list);
      }
    }
    return map;
  }, [filteredConversations]);

  const loadFolders = useCallback(async () => {
    try {
      const list = await ipc.listFolders();
      setFolders(list);
    } catch {
      // Folders not available yet
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const handleCreateFolder = async () => {
    const name = prompt("请输入文件夹名称：");
    if (!name?.trim()) return;
    await ipc.createFolder({ name: name.trim() });
    loadFolders();
  };

  const handleDeleteFolder = async (id: string) => {
    await ipc.deleteFolder(id);
    loadFolders();
  };

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = async (convId: string, format: "json" | "markdown", title?: string) => {
    try {
      const data = await ipc.exportConversation(convId, format);
      const blob = new Blob([data], { type: format === "json" ? "application/json" : "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = (title ?? "conversation").replace(/[/\\?%*:|"<>]/g, "_").slice(0, 50);
      a.download = `${safeName}.${format === "json" ? "json" : "md"}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error("Export failed:", err);
    }
    setShowActions(null);
  };

  const handleImport = async () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      try {
        await ipc.importConversation(text);
        loadConversations();
      } catch (err) {
        console.error("Import failed:", err);
      }
    };
    input.click();
  };

  const handleGoHome = () => {
    clearActiveConversation();
    clearActiveTab();
  };

  const handleConvClick = (id: string, title: string) => {
    setActiveConversation(id);
    openTab(id, title);
  };

  const renderConv = (conv: (typeof conversations)[0]) => (
    <div
      key={conv.id}
      onClick={() => handleConvClick(conv.id, conv.title)}
      className={cn(
        "group flex items-center gap-2 px-3 py-2.5 rounded-[var(--radius-sm)] cursor-pointer transition-colors relative",
        activeId === conv.id
          ? "bg-accent/10 text-accent"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary",
      )}
    >
      <MessageSquare size={14} className="flex-shrink-0 opacity-50" />
      <div className="flex-1 min-w-0">
        <p className="text-sm truncate">{conv.title}</p>
        <p className="text-[10px] text-text-muted truncate">
          {new Date(conv.updated_at).toLocaleDateString()}
          {conv.token_total > 0 && ` · ${conv.token_total} tokens`}
        </p>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {conv.pinned && <Pin size={10} className="text-accent" />}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowActions(showActions === conv.id ? null : conv.id);
          }}
          className="p-1 text-text-muted hover:text-text-primary transition-colors"
        >
          <MoreHorizontal size={12} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm("确定要删除此对话吗？")) {
              deleteConversation(conv.id);
            }
          }}
          className="p-1 text-text-muted hover:text-error transition-colors"
          title="删除"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Context menu */}
      {showActions === conv.id && (
        <div className="absolute right-0 top-full mt-1 bg-bg-elevated border border-border rounded-[var(--radius-sm)] shadow-lg py-1 z-50 min-w-[140px]">
          <button
            onClick={(e) => { e.stopPropagation(); handleExport(conv.id, "json", conv.title); }}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover flex items-center gap-2"
          >
            <Download size={11} /> 导出 JSON
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleExport(conv.id, "markdown", conv.title); }}
            className="w-full text-left px-3 py-1.5 text-xs hover:bg-bg-hover flex items-center gap-2"
          >
            <Download size={11} /> 导出 Markdown
          </button>
        </div>
      )}
    </div>
  );

  return (
    <aside className="w-[260px] bg-bg-secondary border-r border-border flex flex-col flex-shrink-0">
      {/* Header — clickable to go home */}
      <div
        className="h-[52px] flex items-center px-4 border-b border-border"
        data-tauri-drag-region
      >
        <button
          onClick={handleGoHome}
          className="flex items-center gap-2 pl-16 group"
          title="回到首页 (⌘⇧H)"
        >
          <Home size={14} className="text-text-muted group-hover:text-accent transition-colors" />
          <span className="text-sm font-semibold text-accent group-hover:text-accent-hover transition-colors">
            Claude Desktop Pro
          </span>
        </button>
      </div>

      {/* New Chat + Search */}
      <div className="p-3 space-y-2">
        <div className="flex gap-1.5">
          <button
            onClick={() => createConversation()}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-[var(--radius-sm)] bg-accent/10 text-accent text-sm font-medium hover:bg-accent/20 transition-colors"
          >
            <Plus size={16} />
            新对话
          </button>
          <button
            onClick={handleImport}
            className="p-2 rounded-[var(--radius-sm)] bg-bg-elevated border border-border text-text-muted hover:text-text-primary hover:border-accent/30 transition-colors"
            title="导入对话"
          >
            <Upload size={14} />
          </button>
        </div>

        <div className="relative">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索对话..."
            className="w-full bg-bg-primary border border-border rounded-[var(--radius-sm)] pl-8 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors"
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {/* Folders */}
        {folders.length > 0 && (
          <div className="mb-2">
            {folders.filter((f) => !f.parent_id).map((folder) => (
              <div key={folder.id} className="group">
                <div
                  onClick={() => toggleFolder(folder.id)}
                  role="button"
                  tabIndex={0}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-text-muted hover:text-text-secondary rounded transition-colors cursor-pointer"
                >
                  {expandedFolders.has(folder.id) ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <FolderOpen size={12} />
                  <span className="flex-1 text-left truncate">{folder.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm("确定要删除此文件夹吗？")) {
                        handleDeleteFolder(folder.id);
                      }
                    }}
                    className="p-0.5 opacity-0 group-hover:opacity-100 hover:text-error transition-opacity"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
                {expandedFolders.has(folder.id) && (
                  <div className="pl-4">
                    {(folderConversations.get(folder.id) ?? []).map(renderConv)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Create folder button */}
        <button
          onClick={handleCreateFolder}
          className="w-full flex items-center gap-2 px-2 py-1.5 text-xs text-text-muted hover:text-text-secondary rounded transition-colors mb-2"
        >
          <FolderPlus size={12} />
          <span>新建文件夹</span>
        </button>

        {/* Unfiled conversations */}
        {unfiledConversations.length === 0 && folders.length === 0 ? (
          <p className="text-text-muted text-xs px-2 py-4 text-center">
            {searchQuery ? "没有匹配的对话" : "还没有对话"}
          </p>
        ) : (
          <div className="space-y-0.5">
            {unfiledConversations.map(renderConv)}
          </div>
        )}
      </div>
    </aside>
  );
}
