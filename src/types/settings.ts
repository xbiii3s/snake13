/** Application settings */
export interface AppSettings {
  model_id: string;
  theme: "dark" | "light" | "system";
  font_size: number;
  proxy: ProxyConfig;
  api_endpoint: string;
  auto_launch: boolean;
  send_on_enter: boolean;
  show_token_count: boolean;
  language: "zh" | "en";
}

export type ProxyType = "none" | "http" | "socks5" | "system";

export interface ProxyConfig {
  type: ProxyType;
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  model_id: "claude-sonnet-4-5",
  theme: "dark",
  font_size: 14,
  proxy: {
    type: "none",
    host: "",
    port: 0,
  },
  api_endpoint: "https://api.anthropic.com",
  auto_launch: false,
  send_on_enter: true,
  show_token_count: true,
  language: "zh",
};
