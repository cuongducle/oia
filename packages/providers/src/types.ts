/** BYOK adapter contracts — providers know nothing about scenes/agents. */
export interface ImageGenInput {
  prompt: string;
  width: number;
  height: number;
  referenceImages?: string[];
}
export interface ImageGenResult {
  url: string; // http(s) or data:
  provider: string;
  model: string;
}
export interface ImageProvider {
  readonly name: string;
  generate(input: ImageGenInput): Promise<ImageGenResult>;
}

export interface LlmMessage { role: "system" | "user" | "assistant"; content: string }
export interface LlmProvider {
  readonly name: string;
  chat(messages: LlmMessage[], opts?: { json?: boolean }): Promise<string>;
}
