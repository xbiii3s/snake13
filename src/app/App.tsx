import { useEffect, useState } from "react";
import { Sidebar } from "@/components/organisms/Sidebar";
import { Topbar } from "@/components/organisms/Topbar";
import { TabBar } from "@/components/organisms/TabBar";
import { ChatWindow } from "@/app/chat/ChatWindow";
import { SettingsPanel } from "@/app/settings/SettingsPanel";
import { SpotlightWindow } from "@/app/spotlight/SpotlightWindow";
import { ApprovalDialog } from "@/app/agent/ApprovalDialog";
import { ArtifactPanel } from "@/app/artifacts/ArtifactPanel";
import { AuthGuard } from "@/app/auth/AuthGuard";
import { useUIStore } from "@/stores/uiStore";
import { useChatStore } from "@/stores/chatStore";
import { useTabStore } from "@/stores/tabStore";
import type { Artifact } from "@/app/artifacts/ArtifactPanel";

function AppContent() {
  const settingsOpen = useUIStore((s) => s.settingsOpen);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const artifactPanelOpen = useUIStore((s) => s.artifactPanelOpen);
  const [spotlightOpen, setSpotlightOpen] = useState(false);
  const [currentArtifact, setCurrentArtifact] = useState<Artifact | null>(null);

  const loadConversations = useChatStore((s) => s.loadConversations);
  const createConversation = useChatStore((s) => s.createConversation);
  const tabs = useTabStore((s) => s.tabs);

  // Load conversations on mount
  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Listen for global shortcuts from Tauri (e.g. ⌘+Shift+Space when app is in background)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    import("@tauri-apps/api/event").then(({ listen }) => {
      if (cancelled) return;
      listen<string>("global-shortcut", (event) => {
        if (event.payload === "spotlight") {
          setSpotlightOpen((prev) => !prev);
        }
      }).then((fn) => {
        if (cancelled) {
          fn(); // Already unmounted, clean up immediately
        } else {
          unlisten = fn;
        }
      });
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ⌘+, → Settings
      if (e.metaKey && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(!settingsOpen);
        return;
      }
      // ⌘+Shift+Space → Spotlight
      if (e.metaKey && e.shiftKey && e.key === " ") {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
        return;
      }
      // ⌘+N → New conversation
      if (e.metaKey && e.key === "n") {
        e.preventDefault();
        createConversation();
        return;
      }
      // ⌘+K → Search (toggle spotlight as search)
      if (e.metaKey && e.key === "k") {
        e.preventDefault();
        setSpotlightOpen((prev) => !prev);
        return;
      }
      // Escape
      if (e.key === "Escape") {
        if (spotlightOpen) setSpotlightOpen(false);
        else if (settingsOpen) setSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingsOpen, spotlightOpen, setSettingsOpen, createConversation]);

  // Demo artifact for testing (will be driven by message content in production)
  useEffect(() => {
    if (artifactPanelOpen && !currentArtifact) {
      setCurrentArtifact({
        id: "demo",
        type: "code",
        title: "Example Code",
        content: 'fn main() {\n    println!("Hello from Claude Desktop Pro!");\n}',
        language: "rust",
      });
    } else if (!artifactPanelOpen) {
      setCurrentArtifact(null);
    }
  }, [artifactPanelOpen, currentArtifact]);

  return (
    <div className="flex h-screen bg-bg-primary text-text-primary overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <Topbar />

        {/* Tab Bar */}
        {tabs.length > 0 && <TabBar />}

        {/* Chat + Artifact split */}
        <div className="flex-1 flex min-h-0">
          {/* Chat Area */}
          <ChatWindow />

          {/* Artifact Panel */}
          {artifactPanelOpen && <ArtifactPanel artifact={currentArtifact} />}
        </div>
      </main>

      {/* Settings Modal */}
      {settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}

      {/* Spotlight */}
      {spotlightOpen && <SpotlightWindow onClose={() => setSpotlightOpen(false)} />}

      {/* Agent Approval Dialog */}
      <ApprovalDialog />
    </div>
  );
}

function App() {
  return (
    <AuthGuard>
      <AppContent />
    </AuthGuard>
  );
}

export default App;
