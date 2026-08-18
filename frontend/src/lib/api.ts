import { supabase } from "./supabase";

function adaptLocalAddress(configuredUrl: string | undefined, fallbackPort: number) {
  const browserIsLocal = window.location.hostname === "localhost"
    || window.location.hostname === "127.0.0.1";
  const fallback = browserIsLocal
    ? `${window.location.protocol}//${window.location.hostname}:${fallbackPort}`
    : window.location.origin;
  if (!configuredUrl) return fallback;
  try {
    const parsed = new URL(configuredUrl);
    const configuredIsLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (configuredIsLocal && !browserIsLocal) return window.location.origin;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return configuredUrl.replace(/\/$/, "");
  }
}

export const API_URL = adaptLocalAddress(import.meta.env.VITE_API_URL, 8080);
export const WS_URL = adaptLocalAddress(
  import.meta.env.VITE_WS_URL,
  8080
).replace(/\/ws$/, "") + "/ws";

async function authHeaders(includeJsonContentType = true): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    ...(includeJsonContentType ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function responseError(response: Response): Promise<Error> {
  const fallback = `${response.status} ${response.statusText}`.trim();
  const text = await response.text();
  if (!text) return new Error(fallback);
  try {
    const data = JSON.parse(text) as { message?: string; error?: string; status?: number };
    return new Error(data.message || data.error || fallback);
  } catch {
    return new Error(text);
  }
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: await authHeaders() });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function apiPostAudio(path: string, body: unknown): Promise<Blob> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await responseError(response);
  return response.blob();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: await authHeaders(false)
  });
  if (!response.ok) throw await responseError(response);
}

export async function apiDeleteJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: await authHeaders(false)
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export async function apiUpload<T>(path: string, file: Blob, filename: string): Promise<T> {
  const formData = new FormData();
  formData.append("file", file, filename);
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(false),
    body: formData
  });
  if (!response.ok) throw await responseError(response);
  return response.json();
}

export type Profile = {
  id: string;
  displayName: string;
  username: string;
  bio: string;
  avatarPath?: string;
  themeMode: "light" | "dark" | "system";
  accentColor: string;
  onboarded: boolean;
};

export type Conversation = {
  id: string;
  type: "direct" | "group" | "ai_private";
  title: string;
  profile?: Profile;
};

export type Message = {
  id: string;
  conversationId: string;
  senderId?: string;
  type: "text" | "voice" | "photo" | "video" | "file" | "ai";
  body?: string;
  mediaPath?: string;
  replyToMessageId?: string;
  replyPreview?: string;
  forwardedFromMessageId?: string;
  forwarded?: boolean;
  reactions?: Partial<Record<MessageReaction, number>>;
  ownReaction?: MessageReaction;
  status?: "sent" | "delivered" | "seen";
  createdAt: string;
  deletedAt?: string;
};

export type PresenceEvent = {
  userId: string;
  online: boolean;
  seenAt: string;
};

export type MessageReaction = "heart" | "fire" | "like" | "laugh" | "clap";

export type ReadReceipt = {
  conversationId: string;
  userId: string;
  lastReadMessageId: string;
};

export type Story = {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerAvatarPath?: string;
  mediaPath: string;
  caption?: string;
  visibility: "contacts" | "public";
  viewCount: number;
  viewed: boolean;
  reactions: Record<StoryReaction, number>;
  ownReaction?: StoryReaction;
  replies: StoryReply[];
  expiresAt: string;
  createdAt: string;
};

export type StoryReaction = "heart" | "fire" | "like" | "laugh" | "clap";

export type StoryReply = {
  id: string;
  storyId: string;
  senderId: string;
  senderName: string;
  senderAvatarPath?: string;
  body: string;
  createdAt: string;
};

export type Connection = {
  id: string;
  status: "pending" | "accepted";
  direction: "incoming" | "outgoing" | "accepted";
  profile: Profile;
  updatedAt: string;
};
