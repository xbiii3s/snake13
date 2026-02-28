import { create } from "zustand";

export interface Tab {
  id: string;
  conversationId: string;
  title: string;
}

interface TabState {
  tabs: Tab[];
  activeTabId: string | null;

  openTab: (conversationId: string, title: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateTabTitle: (conversationId: string, title: string) => void;
}

export const useTabStore = create<TabState>()((set, get) => ({
  tabs: [],
  activeTabId: null,

  openTab: (conversationId, title) => {
    const existing = get().tabs.find((t) => t.conversationId === conversationId);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }
    const id = `tab-${Date.now()}`;
    const tab: Tab = { id, conversationId, title };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: id,
    }));
  },

  closeTab: (tabId) => {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      let activeTabId = s.activeTabId;
      if (activeTabId === tabId) {
        const idx = s.tabs.findIndex((t) => t.id === tabId);
        activeTabId = tabs[Math.min(idx, tabs.length - 1)]?.id ?? null;
      }
      return { tabs, activeTabId };
    });
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateTabTitle: (conversationId, title) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.conversationId === conversationId ? { ...t, title } : t,
      ),
    }));
  },
}));
