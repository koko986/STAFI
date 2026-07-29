import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

async function authHeaders(includeJsonContentType = true): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    ...(includeJsonContentType ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { headers: await authHeaders() });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function apiDelete(path: string): Promise<void> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "DELETE",
    headers: await authHeaders(false)
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function apiUpload<T>(path: string, file: Blob, filename: string): Promise<T> {
  const formData = new FormData();
  formData.append("file", file, filename);
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: await authHeaders(false),
    body: formData
  });
  if (!response.ok) throw new Error(await response.text());
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
};

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  type: "text" | "voice" | "ai";
  body?: string;
  mediaPath?: string;
  createdAt: string;
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
