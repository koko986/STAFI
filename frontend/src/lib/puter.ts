const PUTER_SCRIPT_URL = "https://js.puter.com/v2/";

type PuterMessageContent = string | Array<{ type?: string; text?: string }>;

type PuterChatResult = {
  message?: {
    role?: string;
    content?: PuterMessageContent;
  };
};

type PuterChatOptions = {
  model?: string;
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
};

declare global {
  interface Window {
    puter?: {
      ai: {
        chat: (prompt: string, options?: PuterChatOptions) => Promise<PuterChatResult>;
      };
    };
  }
}

let scriptPromise: Promise<boolean> | undefined;

export function isPuterReady() {
  return Boolean(window.puter?.ai?.chat);
}

export function loadPuterSdk(): Promise<boolean> {
  if (isPuterReady()) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${PUTER_SCRIPT_URL}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve(isPuterReady());
        return;
      }
      existing.addEventListener("load", () => resolve(isPuterReady()));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = PUTER_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve(isPuterReady());
    };
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
  return scriptPromise;
}

function textOf(message: PuterChatResult["message"]): string {
  const content = message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => part?.text || "")
      .join("")
      .trim();
  }
  return "";
}

export async function puterChat(prompt: string, options: PuterChatOptions = {}): Promise<string> {
  const ready = await loadPuterSdk();
  if (!ready || !window.puter) {
    throw new Error("Puter AI could not be loaded.");
  }
  const result = await window.puter.ai.chat(prompt, options);
  const text = textOf(result.message);
  if (!text) throw new Error("Puter AI returned an empty response.");
  return text;
}
