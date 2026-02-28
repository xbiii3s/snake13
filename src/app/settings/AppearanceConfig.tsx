import { useState } from "react";

export function AppearanceConfig() {
  const [fontSize, setFontSize] = useState(14);
  const [showTokens, setShowTokens] = useState(true);

  return (
    <div>
      <h3 className="text-lg font-semibold mb-4">Appearance</h3>

      <div className="space-y-5">
        {/* Theme */}
        <div>
          <label className="text-sm text-text-secondary block mb-2">Theme</label>
          <div className="grid grid-cols-3 gap-2">
            <button className="py-3 text-sm rounded-[var(--radius-sm)] border border-accent bg-accent/10 text-accent">
              Dark
            </button>
            <button className="py-3 text-sm rounded-[var(--radius-sm)] border border-border bg-bg-elevated text-text-muted cursor-not-allowed opacity-50">
              Light (Soon)
            </button>
            <button className="py-3 text-sm rounded-[var(--radius-sm)] border border-border bg-bg-elevated text-text-muted cursor-not-allowed opacity-50">
              System (Soon)
            </button>
          </div>
        </div>

        {/* Font size */}
        <div>
          <label className="text-sm text-text-secondary block mb-2">
            Font Size: {fontSize}px
          </label>
          <input
            type="range"
            min={11}
            max={18}
            value={fontSize}
            onChange={(e) => setFontSize(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-[10px] text-text-muted mt-1">
            <span>11px</span>
            <span>18px</span>
          </div>
        </div>

        {/* Show token count */}
        <div className="flex items-center justify-between py-2">
          <div>
            <span className="text-sm text-text-primary block">Show token count</span>
            <span className="text-xs text-text-muted">Display tokens and cost per message</span>
          </div>
          <button
            onClick={() => setShowTokens(!showTokens)}
            className={`w-10 h-5 rounded-full relative transition-colors ${
              showTokens ? "bg-accent" : "bg-bg-elevated border border-border"
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform ${
                showTokens ? "left-5.5 translate-x-0.5" : "left-0.5"
              }`}
            />
          </button>
        </div>

        {/* Preview */}
        <div>
          <label className="text-sm text-text-secondary block mb-2">Preview</label>
          <div
            className="bg-bg-elevated border border-border rounded-[var(--radius-md)] p-4"
            style={{ fontSize: `${fontSize}px` }}
          >
            <p className="text-text-primary">This is how your messages will look.</p>
            <p className="text-text-secondary mt-1">Secondary text style.</p>
            <code className="text-accent-light bg-bg-primary px-1 rounded text-sm">code block</code>
          </div>
        </div>
      </div>
    </div>
  );
}
