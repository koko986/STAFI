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
  mediaPath: string;
  caption?: string;
  expiresAt: string;
  createdAt: string;
};
