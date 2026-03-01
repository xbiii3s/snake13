/** Available Claude model */
export interface Model {
  id: string;
  name: string;
  description: string;
  context_window: number;
  input_price_per_million: number;
  output_price_per_million: number;
  capabilities: ModelCapabilities;
}

export interface ModelCapabilities {
  extended_thinking: boolean;
  vision: boolean;
  tool_use: boolean;
}

/** Predefined models */
export const MODELS: Model[] = [
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    description: "最强大的模型，适用于复杂推理和智能体任务",
    context_window: 200_000,
    input_price_per_million: 15.0,
    output_price_per_million: 75.0,
    capabilities: { extended_thinking: true, vision: true, tool_use: true },
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    description: "速度与质量的最佳平衡，适合日常使用",
    context_window: 200_000,
    input_price_per_million: 3.0,
    output_price_per_million: 15.0,
    capabilities: { extended_thinking: true, vision: true, tool_use: true },
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    description: "最快速、最经济实惠",
    context_window: 200_000,
    input_price_per_million: 1.0,
    output_price_per_million: 5.0,
    capabilities: { extended_thinking: false, vision: true, tool_use: true },
  },
];
