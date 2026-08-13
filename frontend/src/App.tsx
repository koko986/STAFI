import { Client } from "@stomp/stompjs";
import {
  Bell,
  Bot,
  ChevronRight,
  LogOut,
  Menu,
  MessageCircle,
  Mic,
  Moon,
  Palette,
  PenLine,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  UserRound,
  Users,
  Volume2
} from "lucide-react";
import SockJS from "sockjs-client";
import { useEffect, useMemo, useState } from "react";
import { ChatDiscovery } from "./components/ChatDiscovery";
import { ChatWindow } from "./components/ChatWindow";
import { Login } from "./components/Login";
import { ProfileDetails } from "./components/ProfileDetails";
import { ProfileOnboarding } from "./components/ProfileOnboarding";
import { Stories } from "./components/Stories";
import { UserInfoPanel } from "./components/UserInfoPanel";
import {
  apiDelete,
  apiDeleteJson,
  apiGet,
  apiPost,
  apiPut,
  WS_URL,
  type Conversation,
  type Message,
  type MessageReaction,
  type PresenceEvent,
  type Profile,
  type ReadReceipt,
  type Story,
  type StoryReaction
} from "./lib/api";
import { storeMedia, uploadMedia } from "./lib/media";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const fallbackConversations: Conversation[] = [
  { id: "11111111-1111-1111-1111-111111111111", type: "direct", title: "Mingalar" },
  { id: "22222222-2222-2222-2222-222222222222", type: "group", title: "Project Team" },
  { id: "33333333-3333-3333-3333-333333333333", type: "ai_private", title: "AI Assistant" }
];

const demoProfile: Profile = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  displayName: "Demo User",
  username: "demo_user",
  bio: "Exploring STAFI.",
  themeMode: "system",
  accentColor: "#2563eb",
  onboarded: true
};

const demoPeople: Profile[] = [
  { ...demoProfile, id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", displayName: "Aye Aye", username: "aye_codes", bio: "Java developer and coffee enthusiast." },
  { ...demoProfile, id: "cccccccc-cccc-cccc-cccc-cccccccccccc", displayName: "Min Khant", username: "minkhant", bio: "Building useful things with friends." },
  { ...demoProfile, id: "dddddddd-dddd-dddd-dddd-dddddddddddd", displayName: "Su Myat", username: "sumyat", bio: "Design, music, and weekend stories." }
];
const noPeople: Profile[] = [];
type AppTab = "chats" | "ai" | "settings" | "profile";
type ChatFilter = "all" | "direct" | "group" | "ai";
type AiApiResponse = { text: string; message?: Message };

function applyLocalReaction(message: Message, reaction?: MessageReaction): Message {
  const previous = message.ownReaction;
  const reactions = { ...(message.reactions || {}) };
  if (previous) {
    const previousCount = reactions[previous] || 0;
    if (previousCount <= 1) delete reactions[previous];
    else reactions[previous] = previousCount - 1;
  }
  if (reaction) reactions[reaction] = (reactions[reaction] || 0) + 1;
  return { ...message, reactions, ownReaction: reaction };
}

function replyPreviewFor(message: Message | undefined) {
  if (!message) return undefined;
  if (message.type === "voice") return "Voice message";
  if (message.type === "photo") return "Photo";
  if (message.type === "video") return "Video";
  if (message.type === "file") return `File: ${message.body || "Attachment"}`;
  return message.body;
}

export function App() {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [loggedIn, setLoggedIn] = useState(!isSupabaseConfigured);
  const [demoMode, setDemoMode] = useState(!isSupabaseConfigured);
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("java-chat-theme") as "light" | "dark") || "light"
  );
  const [profile, setProfile] = useState<Profile>();
  const [profileReady, setProfileReady] = useState(!isSupabaseConfigured);
  const [profileOpen, setProfileOpen] = useState(false);
  const [friendProfile, setFriendProfile] = useState<Profile>();
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<AppTab>("chats");
  const [chatFilter, setChatFilter] = useState<ChatFilter>("all");
  const [searchOpen, setSearchOpen] = useState(false);
  const [storyOwnerToOpen, setStoryOwnerToOpen] = useState<string>();
  const [accountContact, setAccountContact] = useState(
    isSupabaseConfigured ? "" : "Demo account"
  );
  const [conversations, setConversations] = useState<Conversation[]>(
    isSupabaseConfigured ? [] : fallbackConversations
  );
  const [active, setActive] = useState<Conversation | undefined>(
    isSupabaseConfigured ? undefined : fallbackConversations[0]
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [presenceSeenAt, setPresenceSeenAt] = useState<Record<string, number>>({});
  const [presenceTick, setPresenceTick] = useState(Date.now());
  const [stories, setStories] = useState<Story[]>([]);

  const aiConversations = useMemo(
    () => conversations.filter((conversation) => conversation.type === "ai_private"),
    [conversations]
  );
  const filteredConversations = useMemo(
    () => conversations.filter((conversation) => {
      if (chatFilter === "all") return true;
      if (chatFilter === "ai") return conversation.type === "ai_private";
      return conversation.type === chatFilter;
    }),
    [chatFilter, conversations]
  );
  const activeMessages = useMemo(
    () => active ? messages.filter((message) => message.conversationId === active.id && !message.deletedAt) : [],
    [active, messages]
  );
  const conversationPreviews = useMemo(() => {
    const previews: Record<string, string> = {};
    messages
      .filter((message) => !message.deletedAt)
      .sort((left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      )
      .forEach((message) => {
        previews[message.conversationId] = message.type === "voice"
          ? "Voice message"
          : message.type === "photo"
            ? "Photo"
            : message.type === "video"
              ? "Video"
              : message.type === "file"
                ? `File: ${message.body || "Attachment"}`
                : message.type === "ai"
                  ? `AI: ${message.body || "New response"}`
                  : message.body || "New message";
      });
    return previews;
  }, [messages]);
  const onlineUserIds = useMemo(() => {
    const online = new Set<string>();
    Object.entries(presenceSeenAt).forEach(([userId, seenAt]) => {
      if (seenAt && presenceTick - seenAt < 25_000) online.add(userId);
    });
    return online;
  }, [presenceSeenAt, presenceTick]);
  const unreadTotal = useMemo(
    () => Object.values(unreadCounts).reduce((total, count) => total + count, 0),
    [unreadCounts]
  );

  function isOwnMessage(message: Message) {
    return message.senderId === "me" || message.senderId === profile?.id;
  }

  function clearUnread(conversationId: string) {
    setUnreadCounts((current) => {
      if (!current[conversationId]) return current;
      const next = { ...current };
      delete next[conversationId];
      return next;
    });
  }

  function openConversation(conversation: Conversation) {
    setActive(conversation);
    clearUnread(conversation.id);
  }

  function notifyIncomingMessage(conversation: Conversation, message: Message) {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const preview = message.type === "voice"
      ? "Voice message"
      : message.type === "photo"
        ? "Photo"
        : message.type === "video"
          ? "Video"
          : message.type === "file"
            ? `File: ${message.body || "Attachment"}`
            : message.body || "New message";
    new Notification(conversation.title, {
      body: preview,
      tag: conversation.id,
      silent: false
    });
  }

  function upsertMessage(message: Message, preserveViewerState = false) {
    setMessages((current) => {
      if (message.deletedAt) {
        return current.filter((item) => item.id !== message.id);
      }
      const existing = current.find((item) => item.id === message.id);
      if (!existing) return [...current, message];
      const isMedia = message.type === "voice" || message.type === "photo"
        || message.type === "video" || message.type === "file";
      const stableMediaPath = isMedia && existing.mediaPath
        ? existing.mediaPath
        : message.mediaPath;
      const next = preserveViewerState
        ? {
            ...message,
            mediaPath: stableMediaPath,
            ownReaction: existing.ownReaction,
            status: message.status || existing.status
          }
        : { ...message, mediaPath: stableMediaPath };
      return current.map((item) => item.id === message.id ? next : item);
    });
  }

  function mergeConversationMessages(conversationId: string, incoming: Message[]) {
    setMessages((current) => {
      const currentById = new Map(current.map((message) => [message.id, message]));
      const stableIncoming = incoming.map((message) => {
        const existing = currentById.get(message.id);
        const isMedia = message.type === "voice" || message.type === "photo"
          || message.type === "video" || message.type === "file";
        return isMedia && existing?.mediaPath
          ? { ...message, mediaPath: existing.mediaPath }
          : message;
      });
      const incomingIds = new Set(stableIncoming.map((message) => message.id));
      const recentLocalMessages = current.filter((message) => {
        if (message.conversationId !== conversationId || incomingIds.has(message.id)) return false;
        return Date.now() - new Date(message.createdAt).getTime() < 60_000;
      });
      return [
        ...current.filter((message) => message.conversationId !== conversationId),
        ...stableIncoming,
        ...recentLocalMessages
      ].sort((left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      );
    });
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    const sessionTimeout = window.setTimeout(() => {
      if (mounted) setReady(true);
    }, 4000);

    supabase.auth.getSession()
      .then(({ data }) => {
        if (mounted) setLoggedIn(Boolean(data.session));
      })
      .catch(() => {
        if (mounted) setLoggedIn(false);
      })
      .finally(() => {
        if (mounted) setReady(true);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setLoggedIn(Boolean(session));
      setReady(true);
    });

    return () => {
      mounted = false;
      window.clearTimeout(sessionTimeout);
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    if (demoMode) {
      setProfile(demoProfile);
      setProfileReady(true);
      return;
    }
    setProfileReady(false);
    apiGet<Profile>("/api/me/profile")
      .then(setProfile)
      .catch(() => setProfile(undefined))
      .finally(() => setProfileReady(true));
  }, [demoMode, loggedIn]);

  useEffect(() => {
    if (!loggedIn || typeof Notification === "undefined" || Notification.permission !== "default") return;
    Notification.requestPermission().catch(() => undefined);
  }, [loggedIn]);

  useEffect(() => {
    const interval = window.setInterval(() => setPresenceTick(Date.now()), 5000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    document.title = unreadTotal > 0 ? `(${unreadTotal}) STAFI` : "STAFI";
    return () => {
      document.title = "STAFI";
    };
  }, [unreadTotal]);

  useEffect(() => {
    const clearVisibleConversation = () => {
      if (!document.hidden && active?.id) clearUnread(active.id);
    };
    document.addEventListener("visibilitychange", clearVisibleConversation);
    return () => document.removeEventListener("visibilitychange", clearVisibleConversation);
  }, [active?.id]);

  useEffect(() => {
    if (!loggedIn || demoMode) return;
    supabase.auth.getUser()
      .then(({ data }) => setAccountContact(data.user?.phone || data.user?.email || ""))
      .catch(() => setAccountContact(""));
  }, [demoMode, loggedIn]);

  useEffect(() => {
    if (!loggedIn || !profile?.onboarded) return;
    apiGet<Conversation[]>("/api/conversations")
      .then((items) => {
        setConversations(items);
        setActive((current) => items.find((item) => item.id === current?.id) || items[0]);
      })
      .catch(() => {
        if (demoMode) {
          setConversations(fallbackConversations);
          setActive((current) => current || fallbackConversations[0]);
        }
      });
    const loadStories = () => {
      apiGet<Story[]>("/api/stories")
        .then((items) => setStories(items.filter((story) => new Date(story.expiresAt).getTime() > Date.now())))
        .catch(() => undefined);
    };
    loadStories();
    const storyRefresh = window.setInterval(loadStories, 60_000);
    return () => window.clearInterval(storyRefresh);
  }, [demoMode, loggedIn, profile?.onboarded]);

  useEffect(() => {
    if (!loggedIn || !active) return;
    let mounted = true;
    const loadMessages = () => {
      apiGet<Message[]>(`/api/conversations/${active.id}/messages`)
        .then((items) => {
          if (mounted) {
            mergeConversationMessages(active.id, items);
            if (!document.hidden) clearUnread(active.id);
          }
        })
        .catch(() => undefined);
    };
    loadMessages();
    const refresh = window.setInterval(loadMessages, 2500);
    return () => {
      mounted = false;
      window.clearInterval(refresh);
    };
  }, [active, loggedIn]);

  useEffect(() => {
    if (!loggedIn || !conversations.length) return;
    let presenceTimer: number | undefined;
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 1000,
      connectionTimeout: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        const publishPresence = (online: boolean) => {
          if (!profile?.id) return;
          client.publish({
            destination: "/app/presence",
            body: JSON.stringify({ userId: profile.id, online })
          });
        };
        client.subscribe("/topic/presence", (frame) => {
          const event = JSON.parse(frame.body) as PresenceEvent;
          if (!event.userId || event.userId === profile?.id) return;
          setPresenceSeenAt((current) => {
            const next = { ...current };
            if (event.online) next[event.userId] = Date.parse(event.seenAt) || Date.now();
            else delete next[event.userId];
            return next;
          });
        });
        publishPresence(true);
        if (presenceTimer) window.clearInterval(presenceTimer);
        presenceTimer = window.setInterval(() => publishPresence(true), 10000);
        conversations.forEach((conversation) => {
          client.subscribe(`/topic/conversations/${conversation.id}`, (frame) => {
            const incoming = JSON.parse(frame.body) as Message;
            upsertMessage(incoming, true);
            if (!isOwnMessage(incoming) && !incoming.deletedAt) {
              const senderId = incoming.senderId;
              if (senderId) {
                setPresenceSeenAt((current) => ({ ...current, [senderId]: Date.now() }));
              }
              if (active?.id !== incoming.conversationId || document.hidden) {
                setUnreadCounts((current) => ({
                  ...current,
                  [incoming.conversationId]: (current[incoming.conversationId] || 0) + 1
                }));
                notifyIncomingMessage(conversation, incoming);
              }
            }
          });
          client.subscribe(`/topic/conversations/${conversation.id}/receipts`, (frame) => {
            const receipt = JSON.parse(frame.body) as ReadReceipt;
            if (receipt.userId === profile?.id || conversation.type !== "direct") return;
            setMessages((current) => {
              const conversationMessages = current.filter(
                (message) => message.conversationId === receipt.conversationId
              );
              const readIndex = conversationMessages.findIndex(
                (message) => message.id === receipt.lastReadMessageId
              );
              if (readIndex < 0) return current;
              const readIds = new Set(conversationMessages.slice(0, readIndex + 1).map((message) => message.id));
              return current.map((message) =>
                readIds.has(message.id)
                  && (message.senderId === "me" || message.senderId === profile?.id)
                  ? { ...message, status: "seen" }
                  : message
              );
            });
          });
        });
      }
    });
    client.activate();
    return () => {
      if (presenceTimer) window.clearInterval(presenceTimer);
      if (profile?.id && client.connected) {
        client.publish({
          destination: "/app/presence",
          body: JSON.stringify({ userId: profile.id, online: false })
        });
      }
      client.deactivate();
    };
  }, [active?.id, conversations, loggedIn, profile?.id]);

  async function send(body: string, replyToMessageId?: string) {
    if (!active) return;
    if (active.type === "ai_private") {
      await sendAiMessage(body, replyToMessageId);
      return;
    }
    const replyingTo = replyToMessageId
      ? activeMessages.find((message) => message.id === replyToMessageId)
      : undefined;
    const id = crypto.randomUUID();
    const optimistic: Message = {
      id,
      conversationId: active.id,
      senderId: "me",
      type: "text",
      body,
      replyToMessageId,
      replyPreview: replyPreviewFor(replyingTo),
      reactions: {},
      status: "sent",
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, optimistic]);
    const saved = await apiPost<Message>("/api/messages", {
      id,
      conversationId: active.id,
      type: "text",
      body,
      replyToMessageId
    }).catch(() => undefined);
    if (saved) upsertMessage(saved);
  }

  async function sendAiMessage(body: string, replyToMessageId?: string) {
    if (!active || active.type !== "ai_private") return undefined;
    const replyingTo = replyToMessageId
      ? activeMessages.find((message) => message.id === replyToMessageId)
      : undefined;
    const id = crypto.randomUUID();
    const optimistic: Message = {
      id,
      conversationId: active.id,
      senderId: "me",
      type: "text",
      body,
      replyToMessageId,
      replyPreview: replyPreviewFor(replyingTo),
      reactions: {},
      status: "sent",
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, optimistic]);
    const saved = await apiPost<Message>("/api/messages", {
      id,
      conversationId: active.id,
      type: "text",
      body,
      replyToMessageId
    }).catch(() => undefined);
    if (saved) upsertMessage(saved);

    const context = [...activeMessages, saved || optimistic]
      .filter((message) => message.body)
      .slice(-24)
      .map((message) => {
        const speaker = message.type === "ai"
          ? "AI"
          : message.senderId === "me" || message.senderId === profile?.id
            ? "Me"
            : active.title;
        return `${speaker}: ${message.body}`;
      })
      .join("\n");
    const response = await apiPost<AiApiResponse>("/api/ai/chat", {
      conversationId: active.id,
      action: "chat",
      prompt: context
    }).catch((): AiApiResponse => ({ text: "AI assistant is ready once the Java backend and AI provider are configured." }));
    if (response.message) {
      upsertMessage(response.message);
    } else {
      upsertMessage({
        id: crypto.randomUUID(),
        conversationId: active.id,
        senderId: "ai",
        type: "ai",
        body: response.text,
        createdAt: new Date().toISOString()
      });
    }
    return response.text;
  }

  async function sendVoice(voice: Blob, replyToMessageId?: string) {
    if (!active) return;
    const mimeType = voice.type.split(";")[0].toLowerCase();
    const extension = mimeType === "audio/mp4"
      ? "m4a"
      : mimeType === "audio/ogg"
        ? "ogg"
        : mimeType === "audio/mpeg"
          ? "mp3"
          : "webm";
    const uploaded = await uploadMedia("voice-messages", voice, extension);
    const replyingTo = replyToMessageId
      ? activeMessages.find((message) => message.id === replyToMessageId)
      : undefined;
    const id = crypto.randomUUID();
    const message: Message = {
      id,
      conversationId: active.id,
      senderId: "me",
      type: "voice",
      mediaPath: uploaded.url,
      replyToMessageId,
      replyPreview: replyPreviewFor(replyingTo),
      reactions: {},
      status: "sent",
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, message]);
    try {
      const saved = await apiPost<Message>("/api/messages", {
        id,
        conversationId: active.id,
        type: "voice",
        mediaPath: uploaded.path,
        replyToMessageId
      });
      upsertMessage(saved);
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== id));
      throw error;
    }
  }

  async function refreshVoiceMedia(messageId: string) {
    if (!active) throw new Error("Open the conversation before playing voice messages.");
    const items = await apiGet<Message[]>(`/api/conversations/${active.id}/messages`);
    const refreshed = items.find((message) => message.id === messageId && message.type === "voice");
    if (!refreshed?.mediaPath) throw new Error("Voice message was not found.");
    setMessages((current) => current.map((message) =>
      message.id === messageId ? { ...message, mediaPath: refreshed.mediaPath } : message
    ));
    return refreshed.mediaPath;
  }

  async function sendMedia(file: File, replyToMessageId?: string) {
    if (!active) return;
    const mimeType = file.type.toLowerCase();
    const extension = file.name.split(".").pop()?.toLowerCase()
      || (mimeType.startsWith("image/") ? "jpg" : mimeType.startsWith("video/") ? "mp4" : "bin");
    const imageExtensions = new Set(["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"]);
    const videoExtensions = new Set(["mp4", "webm", "mov"]);
    const type = mimeType.startsWith("image/") || imageExtensions.has(extension)
      ? "photo"
      : mimeType.startsWith("video/") || videoExtensions.has(extension)
        ? "video"
        : "file";
    const uploaded = await uploadMedia("chat-files", file, extension);
    const replyingTo = replyToMessageId
      ? activeMessages.find((message) => message.id === replyToMessageId)
      : undefined;
    const id = crypto.randomUUID();
    const message: Message = {
      id,
      conversationId: active.id,
      senderId: "me",
      type,
      body: type === "file" ? file.name : undefined,
      mediaPath: uploaded.url,
      replyToMessageId,
      replyPreview: replyPreviewFor(replyingTo),
      reactions: {},
      status: "sent",
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, message]);
    try {
      const saved = await apiPost<Message>("/api/messages", {
        id,
        conversationId: active.id,
        type,
        body: type === "file" ? file.name : undefined,
        mediaPath: uploaded.path,
        replyToMessageId
      });
      upsertMessage(saved);
    } catch (error) {
      setMessages((current) => current.filter((item) => item.id !== id));
      throw error;
    }
  }

  async function deleteMessage(message: Message, mode: "me" | "all") {
    if (demoMode) {
      setMessages((current) => current.filter((item) => item.id !== message.id));
      return;
    }
    if (mode === "me") {
      await apiDeleteJson<Message>(`/api/messages/${message.id}/me`);
      setMessages((current) => current.filter((item) => item.id !== message.id));
      return;
    }
    const deleted = await apiDeleteJson<Message>(`/api/messages/${message.id}`);
    upsertMessage(deleted);
  }

  async function forwardMessage(message: Message, conversationId: string) {
    if (demoMode) {
      const forwarded: Message = {
        ...message,
        id: crypto.randomUUID(),
        conversationId,
        senderId: "me",
        forwarded: true,
        forwardedFromMessageId: message.id,
        status: "sent",
        createdAt: new Date().toISOString()
      };
      upsertMessage(forwarded);
      return;
    }
    const forwarded = await apiPost<Message>(`/api/messages/${message.id}/forward`, { conversationId });
    upsertMessage(forwarded);
  }

  async function reactToMessage(message: Message, reaction: MessageReaction) {
    const optimistic = applyLocalReaction(message, reaction);
    upsertMessage(optimistic);
    if (demoMode) return;
    try {
      const updated = await apiPut<Message>(`/api/messages/${message.id}/reaction`, { emoji: reaction });
      upsertMessage(updated);
    } catch (error) {
      upsertMessage(message);
      throw error;
    }
  }

  async function removeMessageReaction(message: Message) {
    const optimistic = applyLocalReaction(message);
    upsertMessage(optimistic);
    if (demoMode) return;
    try {
      const updated = await apiDeleteJson<Message>(`/api/messages/${message.id}/reaction`);
      upsertMessage(updated);
    } catch (error) {
      upsertMessage(message);
      throw error;
    }
  }

  async function createStory(file: File, caption: string, visibility: Story["visibility"]) {
    const extension = file.name.split(".").pop() || (file.type.startsWith("video") ? "webm" : "jpg");
    const uploaded = await uploadMedia("stories", file, extension);
    const saved = await apiPost<Story>("/api/stories", {
      mediaPath: uploaded.path,
      caption,
      visibility
    });
    setStories((current) => [saved, ...current]);
  }

  async function deleteStory(storyId: string) {
    await apiDelete(`/api/stories/${storyId}`);
    setStories((current) => current.filter((story) => story.id !== storyId));
  }

  async function viewStory(story: Story) {
    const updated = await apiPost<Story>(`/api/stories/${story.id}/views`, {});
    setStories((current) => current.map((item) => item.id === updated.id ? updated : item));
    return updated;
  }

  async function reactToStory(story: Story, reaction: StoryReaction) {
    const updated = await apiPut<Story>(`/api/stories/${story.id}/reaction`, { emoji: reaction });
    setStories((current) => current.map((item) => item.id === updated.id ? updated : item));
    return updated;
  }

  async function removeStoryReaction(story: Story) {
    await apiDelete(`/api/stories/${story.id}/reaction`);
    const reactions = { ...story.reactions };
    if (story.ownReaction && reactions[story.ownReaction]) {
      reactions[story.ownReaction] -= 1;
      if (reactions[story.ownReaction] <= 0) delete reactions[story.ownReaction];
    }
    const updated = { ...story, reactions, ownReaction: undefined };
    setStories((current) => current.map((item) => item.id === updated.id ? updated : item));
    return updated;
  }

  async function replyToStory(story: Story, body: string) {
    const updated = await apiPost<Story>(`/api/stories/${story.id}/replies`, { body });
    setStories((current) => current.map((item) => item.id === updated.id ? updated : item));
    apiGet<Conversation[]>("/api/conversations")
      .then(setConversations)
      .catch(() => undefined);
    return updated;
  }

  async function openFriendProfile(profileOrId: Profile | string) {
    setProfileOpen(false);
    if (typeof profileOrId !== "string") {
      setFriendProfile(profileOrId);
      return;
    }
    const found = await apiGet<Profile>(`/api/profiles/${profileOrId}`).catch(() => undefined);
    if (found) setFriendProfile(found);
  }

  async function aiRequest(
    action: "summarize" | "draft-reply" | "question" | "chat",
    prompt: string
  ): Promise<string> {
    const endpoint = action === "chat" ? "chat" : action;
    const response = await apiPost<{ text: string }>(`/api/ai/${endpoint}`, {
      conversationId: active?.id,
      action,
      prompt
    });
    return response.text;
  }

  async function askAi(action: "summarize" | "draft-reply" | "question" | "chat", promptOverride?: string) {
    if (!active) return undefined;
    if ((action === "chat" || action === "question") && promptOverride && active.type === "ai_private") {
      return sendAiMessage(promptOverride);
    }
    const context = activeMessages
      .filter((message) => message.body)
      .slice(-20)
      .map((message) => {
        const speaker = message.senderId === "ai"
          ? "AI"
          : message.senderId === "me" || message.senderId === profile?.id
            ? "Me"
            : active.title;
        return `${speaker}: ${message.body}`;
      })
      .join("\n") || "No messages yet.";
    const prompt = promptOverride
      ? `Chat context:\n${context}\n\nUser request:\n${promptOverride}`
      : context;
    if (promptOverride && action !== "question") {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          conversationId: active.id,
          senderId: "me",
          type: "text",
          body: promptOverride,
          status: "sent",
          createdAt: new Date().toISOString()
        }
      ]);
    }
    const response = await aiRequest(action, prompt).then(
      (text) => ({ text }),
      () => ({
        text: action === "summarize"
          ? "AI summary is ready once the Java backend is running."
          : action === "draft-reply"
            ? "Suggested reply: Thanks for the update. I'll get back to you shortly."
            : "AI assistant is ready once the Java backend is running."
      })
    );

    setMessages((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        conversationId: active.id,
        senderId: "ai",
        type: "ai",
        body: response.text,
        createdAt: new Date().toISOString()
      }
    ]);
    return response.text;
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("java-chat-theme", next);
  }

  function openTab(tab: AppTab) {
    setActiveTab(tab);
    setMobileChatOpen(false);
    setFriendProfile(undefined);
    if (tab !== "chats") setSearchOpen(false);
    if (tab === "profile") setProfileOpen(false);
    if (tab === "ai" && aiConversations[0]) {
      setActive((current) => current?.type === "ai_private" ? current : aiConversations[0]);
    }
  }

  function toggleSearch() {
    setActiveTab("chats");
    setMobileChatOpen(false);
    setFriendProfile(undefined);
    setSearchOpen((current) => activeTab === "chats" ? !current : true);
  }

  async function signOut() {
    if (!demoMode) await supabase.auth.signOut();
    setDemoMode(false);
    setLoggedIn(false);
    setProfile(undefined);
    setProfileReady(false);
    setConversations([]);
    setActive(undefined);
    setMessages([]);
    setUnreadCounts({});
    setPresenceSeenAt({});
    setStories([]);
    setProfileOpen(false);
    setFriendProfile(undefined);
  }

  async function saveProfile(updatedProfile: Profile) {
    if (demoMode) {
      setProfile(updatedProfile);
      return;
    }
    const saved = await apiPut<Profile>("/api/me/profile", updatedProfile);
    setProfile(saved);
  }

  async function startDirect(profileToChat: Profile) {
    const conversation: Conversation = demoMode
      ? conversations.find(
          (item) => item.type === "direct" && item.title === profileToChat.displayName
        ) || {
          id: crypto.randomUUID(),
          type: "direct",
          title: profileToChat.displayName,
          profile: profileToChat
        }
      : await apiPost<Conversation>("/api/conversations/direct", {
          profileId: profileToChat.id
        });

    setConversations((current) =>
      current.some((item) => item.id === conversation.id) ? current : [conversation, ...current]
    );
    openConversation(conversation);
    setMobileChatOpen(true);
  }

  async function createGroup(title: string, memberIds: string[]) {
    const conversation: Conversation = demoMode
      ? { id: crypto.randomUUID(), type: "group", title }
      : await apiPost<Conversation>("/api/conversations/groups", { title, memberIds });
    setConversations((current) => [conversation, ...current]);
    openConversation(conversation);
    setMobileChatOpen(true);
  }

  if (!ready) {
    return (
      <main className="loading-shell" aria-live="polite">
        <div className="loading-mark" aria-hidden="true">S</div>
        <strong>STAFI</strong>
        <span>Connecting...</span>
      </main>
    );
  }
  if (!loggedIn) {
    return <Login />;
  }
  if (!profileReady) {
    return (
      <main className="loading-shell" aria-live="polite">
        <div className="loading-mark" aria-hidden="true">S</div>
        <strong>Preparing your chats</strong>
        <span>Loading profile...</span>
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="loading-shell" aria-live="polite">
        <div className="loading-mark" aria-hidden="true">!</div>
        <strong>Could not load your profile</strong>
        <span>Check that the Java backend is running, then try again.</span>
        <button className="primary-button" type="button" onClick={() => window.location.reload()}>
          Try again
        </button>
        <button className="text-button" type="button" onClick={signOut}>
          Sign out
        </button>
      </main>
    );
  }
  if (!demoMode && profile && !profile.onboarded) {
    return (
      <ProfileOnboarding
        initialProfile={profile}
        onComplete={setProfile}
        onSignOut={signOut}
      />
    );
  }

  const tabLabel = activeTab === "chats"
    ? searchOpen ? "Search" : "Chats"
    : activeTab === "ai"
      ? "Assistant"
      : activeTab === "settings"
        ? "Settings"
        : "People";

  return (
    <main className={`${theme === "dark" ? "app dark" : "app"} ${profileOpen || friendProfile ? "info-open" : ""} ${mobileChatOpen ? "mobile-chat-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <button
            className="current-profile"
            type="button"
            title="Open people"
            onClick={() => openTab("profile")}
          >
            <span className="stafi-logo-mark image-mark" aria-hidden="true">
              <img src="/stafi-logo.jpg" alt="" />
            </span>
            <span>
              <strong>{tabLabel}</strong>
              <small>{demoMode ? "Demo mode" : "STAFI"}</small>
            </span>
          </button>
          <span className="brand-actions">
            <button
              className={searchOpen && activeTab === "chats" ? "active" : ""}
              type="button"
              title={searchOpen && activeTab === "chats" ? "Close search" : "Search chats"}
              onClick={toggleSearch}
            >
              <Search size={22} />
            </button>
            <button type="button" title="More options" onClick={() => openTab("settings")}>
              <Menu size={22} />
            </button>
          </span>
        </div>
        {activeTab === "chats" && (
          <>
            {!searchOpen && (
              <>
                <div className="chat-filter-pills stafi-segments" aria-label="Chat filters">
                  {([
                    ["all", "All"],
                    ["direct", "Chats"],
                    ["group", "Groups"],
                    ["ai", "AI"]
                  ] as Array<[ChatFilter, string]>).map(([value, label]) => (
                    <button
                      className={chatFilter === value ? "active" : ""}
                      type="button"
                      key={value}
                      onClick={() => setChatFilter(value)}
                    >
                      {label}
                      {value === "ai" && aiConversations.length > 0 && <small>{aiConversations.length}</small>}
                    </button>
                  ))}
                </div>
                <Stories
                  stories={stories}
                  currentUserId={profile.id}
                  openOwnerId={storyOwnerToOpen}
                  onOwnerStoryOpened={() => setStoryOwnerToOpen(undefined)}
                  onCreate={createStory}
                  onDelete={deleteStory}
                  onViewed={viewStory}
                  onReact={reactToStory}
                  onRemoveReaction={removeStoryReaction}
                  onReply={replyToStory}
                  onViewProfile={(profileId) => openFriendProfile(profileId)}
                />
              </>
            )}
            <ChatDiscovery
              conversations={filteredConversations}
              activeId={active?.id}
              searchOpen={searchOpen}
              unreadCounts={unreadCounts}
              onlineUserIds={onlineUserIds}
              conversationPreviews={conversationPreviews}
              onSelect={(conversation) => {
                openConversation(conversation);
                setFriendProfile(undefined);
                setMobileChatOpen(true);
              }}
              onStartDirect={startDirect}
              onViewProfile={(selectedProfile) => openFriendProfile(selectedProfile)}
              onCreateGroup={createGroup}
              fallbackPeople={demoMode ? demoPeople : noPeople}
            />
            <button className="compose-fab" type="button" title="New chat" onClick={toggleSearch}>
              <PenLine size={24} />
            </button>
          </>
        )}
        {activeTab === "ai" && (
          <AiTab
            conversations={aiConversations}
            activeId={active?.id}
            onSelect={(conversation) => {
              openConversation(conversation);
              setMobileChatOpen(true);
            }}
            onSummarize={() => askAi("summarize")}
            onDraft={() => askAi("draft-reply")}
            onAsk={(prompt) => askAi("question", prompt)}
            onChat={(prompt) => askAi("chat", prompt)}
          />
        )}
        {activeTab === "settings" && (
          <SettingsTab
            theme={theme}
            demoMode={demoMode}
            accountContact={accountContact}
            onToggleTheme={toggleTheme}
            onOpenProfile={() => openTab("profile")}
            onSignOut={signOut}
          />
        )}
        {activeTab === "profile" && (
          <ProfileTab
            profile={profile}
            accountContact={accountContact}
            onEdit={() => {
              setFriendProfile(undefined);
              setProfileOpen(true);
            }}
            onSignOut={signOut}
          />
        )}
        <nav className="app-tab-bar" aria-label="Primary">
          <button className={activeTab === "chats" ? "active" : ""} type="button" onClick={() => openTab("chats")}>
            <MessageCircle size={23} />
            <span>Chat</span>
          </button>
          <button className={activeTab === "ai" ? "active" : ""} type="button" onClick={() => openTab("ai")}>
            <img className="tab-logo" src="/stafi-logo.jpg" alt="" />
            <span>Assistance</span>
          </button>
          <button className={activeTab === "profile" ? "active" : ""} type="button" onClick={() => openTab("profile")}>
            <Users size={23} />
            <span>People</span>
          </button>
          <button className={activeTab === "settings" ? "active" : ""} type="button" onClick={() => openTab("settings")}>
            <Settings size={23} />
            <span>Setting</span>
          </button>
        </nav>
      </aside>
      <ChatWindow
        conversation={active}
        conversations={conversations}
        messages={activeMessages}
        currentUserId={profile?.id}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSend={send}
        onSendVoice={sendVoice}
        onSendMedia={sendMedia}
        onRefreshVoice={refreshVoiceMedia}
        onAskAi={askAi}
        onDelete={deleteMessage}
        onForward={forwardMessage}
        onReact={reactToMessage}
        onRemoveReaction={removeMessageReaction}
        onBack={() => setMobileChatOpen(false)}
        onOpenInfo={() => {
          if (active?.profile) openFriendProfile(active.profile);
        }}
      />
      <ProfileDetails
        profile={profile}
        accountContact={accountContact}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onSave={saveProfile}
      />
      <UserInfoPanel
        profile={friendProfile}
        messages={active?.profile?.id === friendProfile?.id ? activeMessages : []}
        stories={stories}
        onRefreshVoice={refreshVoiceMedia}
        onClose={() => setFriendProfile(undefined)}
        onMessage={startDirect}
        onOpenStories={(profileId) => {
          setStoryOwnerToOpen(profileId);
          setFriendProfile(undefined);
          setActiveTab("chats");
          setSearchOpen(false);
        }}
      />
    </main>
  );
}

function AiTab({
  conversations,
  activeId,
  onSelect,
  onSummarize,
  onDraft,
  onAsk,
  onChat
}: {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (conversation: Conversation) => void;
  onSummarize: () => void;
  onDraft: () => void;
  onAsk: (prompt: string) => Promise<string | undefined>;
  onChat: (prompt: string) => Promise<string | undefined>;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [status, setStatus] = useState("");

  function speak(text: string) {
    if (!voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }

  async function submit(mode: "question" | "chat", text = prompt) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setStatus(mode === "question" ? "Thinking through your question..." : "Talking with AI...");
    try {
      const answer = mode === "question" ? await onAsk(trimmed) : await onChat(trimmed);
      if (answer) speak(answer);
      setPrompt("");
      setStatus(answer ? "AI answered in the active chat." : "Open an AI chat first.");
    } catch {
      setStatus("Could not reach the AI assistant right now.");
    } finally {
      setBusy(false);
    }
  }

  function startVoice() {
    const SpeechRecognition = (window as unknown as {
      SpeechRecognition?: new () => any;
      webkitSpeechRecognition?: new () => any;
    }).SpeechRecognition || (window as unknown as {
      webkitSpeechRecognition?: new () => any;
    }).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setStatus("Voice input is not supported in this browser.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.onstart = () => {
      setListening(true);
      setStatus("Listening...");
    };
    recognition.onerror = () => {
      setListening(false);
      setStatus("Voice input failed. Check microphone permission.");
    };
    recognition.onend = () => setListening(false);
    recognition.onresult = (event: any) => {
      const text = event.results[0]?.[0]?.transcript || "";
      setPrompt(text);
      void submit("chat", text);
    };
    recognition.start();
  }

  return (
    <section className="tab-page ai-tab" aria-label="AI">
      <div className="glass-hero">
        <span><Sparkles size={25} /></span>
        <h2>AI assistant</h2>
        <p>Summaries, questions, private conversation, and voice assistance stay close to your chats.</p>
      </div>
      <div className="quick-actions">
        <button type="button" onClick={onSummarize}>
          <Bot size={18} />
          <span>
            <strong>Summarize active chat</strong>
            <small>Catch up fast</small>
          </span>
        </button>
        <button type="button" onClick={onDraft}>
          <Sparkles size={18} />
          <span>
            <strong>Draft reply</strong>
            <small>Get a polished suggestion</small>
          </span>
        </button>
      </div>
      <form
        className="ai-assistant-panel"
        onSubmit={(event) => {
          event.preventDefault();
          void submit("question");
        }}
      >
        <label>
          Ask AI
          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Ask a question, or talk with the assistant..."
            rows={3}
          />
        </label>
        <div className="ai-assistant-actions">
          <button type="submit" disabled={busy || !prompt.trim()}>
            <Send size={17} />
            <span>Ask</span>
          </button>
          <button type="button" disabled={busy || !prompt.trim()} onClick={() => void submit("chat")}>
            <Bot size={17} />
            <span>Chat</span>
          </button>
          <button
            className={listening ? "active" : ""}
            type="button"
            disabled={busy}
            onClick={startVoice}
          >
            {listening ? <Square size={17} /> : <Mic size={17} />}
            <span>{listening ? "Stop" : "Voice"}</span>
          </button>
          <button
            className={voiceEnabled ? "active" : ""}
            type="button"
            onClick={() => {
              if (voiceEnabled && "speechSynthesis" in window) window.speechSynthesis.cancel();
              setVoiceEnabled((current) => !current);
            }}
          >
            <Volume2 size={17} />
            <span>Speak</span>
          </button>
        </div>
        {status && <p className="ai-assistant-status" role="status">{status}</p>}
      </form>
      <div className="glass-list">
        <div className="section-label"><span>AI chats</span><small>{conversations.length}</small></div>
        {conversations.map((conversation) => (
          <button
            className={conversation.id === activeId ? "glass-row active" : "glass-row"}
            type="button"
            key={conversation.id}
            onClick={() => onSelect(conversation)}
          >
            <span className="avatar ai-avatar">AI</span>
            <span>
              <strong>{conversation.title}</strong>
              <small>Private assistant</small>
            </span>
            <ChevronRight size={17} />
          </button>
        ))}
        {!conversations.length && <p className="empty-note">No AI chats yet.</p>}
      </div>
    </section>
  );
}

function SettingsTab({
  theme,
  demoMode,
  accountContact,
  onToggleTheme,
  onOpenProfile,
  onSignOut
}: {
  theme: "light" | "dark";
  demoMode: boolean;
  accountContact: string;
  onToggleTheme: () => void;
  onOpenProfile: () => void;
  onSignOut: () => void;
}) {
  return (
    <section className="tab-page settings-tab" aria-label="Settings">
      <div className="glass-list">
        <button className="glass-row" type="button" onClick={onToggleTheme}>
          <span className="setting-icon">{theme === "dark" ? <Moon size={19} /> : <Sun size={19} />}</span>
          <span>
            <strong>Appearance</strong>
            <small>{theme === "dark" ? "Dark glass" : "Light glass"}</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button className="glass-row" type="button" onClick={onOpenProfile}>
          <span className="setting-icon"><Palette size={19} /></span>
          <span>
            <strong>Profile style</strong>
            <small>Edit name, username, bio, and avatar</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <div className="glass-row passive">
          <span className="setting-icon"><ShieldCheck size={19} /></span>
          <span>
            <strong>Account</strong>
            <small>{demoMode ? "Demo mode" : accountContact || "Signed in"}</small>
          </span>
        </div>
        <div className="glass-row passive">
          <span className="setting-icon"><Bell size={19} /></span>
          <span>
            <strong>Notifications</strong>
            <small>Ready for contact and story updates</small>
          </span>
        </div>
      </div>
      <button className="danger-glass-button" type="button" onClick={onSignOut}>
        <LogOut size={18} />
        Sign out
      </button>
    </section>
  );
}

function ProfileTab({
  profile,
  accountContact,
  onEdit,
  onSignOut
}: {
  profile: Profile;
  accountContact: string;
  onEdit: () => void;
  onSignOut: () => void;
}) {
  return (
    <section className="tab-page profile-tab" aria-label="Profile">
      <div className="profile-card-glass">
        <span className="profile-details-avatar">
          {profile.avatarPath
            ? <img src={profile.avatarPath} alt="" />
            : <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>}
        </span>
        <h2>{profile.displayName}</h2>
        <p>@{profile.username}</p>
        {profile.bio && <small>{profile.bio}</small>}
      </div>
      <div className="glass-list">
        <button className="glass-row" type="button" onClick={onEdit}>
          <span className="setting-icon"><UserRound size={19} /></span>
          <span>
            <strong>Edit profile</strong>
            <small>{accountContact || "Profile and identity"}</small>
          </span>
          <ChevronRight size={17} />
        </button>
        <button className="glass-row" type="button" onClick={onSignOut}>
          <span className="setting-icon"><LogOut size={19} /></span>
          <span>
            <strong>Sign out</strong>
            <small>Leave this device</small>
          </span>
          <ChevronRight size={17} />
        </button>
      </div>
    </section>
  );
}
