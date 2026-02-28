import { create } from "zustand";

interface UIState {
  sidebarOpen: boolean;
  artifactPanelOpen: boolean;
  settingsOpen: boolean;
  searchQuery: string;

  toggleSidebar: () => void;
  toggleArtifactPanel: () => void;
  setSettingsOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  sidebarOpen: true,
  artifactPanelOpen: false,
  settingsOpen: false,
  searchQuery: "",

  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  toggleArtifactPanel: () => set((s) => ({ artifactPanelOpen: !s.artifactPanelOpen })),
  setSettingsOpen: (open) => set({ settingsOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));
