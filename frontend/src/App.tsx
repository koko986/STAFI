import { Client } from "@stomp/stompjs";
import { LogOut } from "lucide-react";
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
  bio: "Exploring Java Chat.",
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
  const [stories, setStories] = useState<Story[]>([]);

  const activeMessages = useMemo(
    () => active ? messages.filter((message) => message.conversationId === active.id && !message.deletedAt) : [],
    [active, messages]
  );

  function upsertMessage(message: Message, preserveViewerState = false) {
    setMessages((current) => {
      if (message.deletedAt) {
        return current.filter((item) => item.id !== message.id);
      }
      const existing = current.find((item) => item.id === message.id);
      if (!existing) return [...current, message];
      const stableMediaPath = message.type === "voice" && existing.mediaPath
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
        return message.type === "voice" && existing?.mediaPath
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
          if (mounted) mergeConversationMessages(active.id, items);
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
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL),
      reconnectDelay: 1000,
      connectionTimeout: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        conversations.forEach((conversation) => {
          client.subscribe(`/topic/conversations/${conversation.id}`, (frame) => {
            const incoming = JSON.parse(frame.body) as Message;
            upsertMessage(incoming, true);
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
      client.deactivate();
    };
  }, [conversations, loggedIn, profile?.id]);

  async function send(body: string, replyToMessageId?: string) {
    if (!active) return;
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
      replyPreview: replyingTo?.type === "voice" ? "Voice message" : replyingTo?.body,
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
      replyPreview: replyingTo?.type === "voice" ? "Voice message" : replyingTo?.body,
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

  async function deleteMessage(message: Message) {
    if (demoMode) {
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

  async function askAi(action: "summarize" | "draft-reply") {
    if (!active) return;
    const prompt = activeMessages
      .filter((message) => message.body)
      .slice(-20)
      .map((message) => message.body)
      .join("\n") || "No messages yet.";
    const response = await apiPost<{ text: string }>(`/api/ai/${action}`, {
      conversationId: active.id,
      action,
      prompt
    }).catch(() => ({
      text: action === "summarize"
        ? "AI summary is ready once the Java backend is running."
        : "Suggested reply: Thanks for the update. I’ll get back to you shortly."
    }));

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
  }

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("java-chat-theme", next);
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
    setActive(conversation);
    setMobileChatOpen(true);
  }

  async function createGroup(title: string, memberIds: string[]) {
    const conversation: Conversation = demoMode
      ? { id: crypto.randomUUID(), type: "group", title }
      : await apiPost<Conversation>("/api/conversations/groups", { title, memberIds });
    setConversations((current) => [conversation, ...current]);
    setActive(conversation);
    setMobileChatOpen(true);
  }

  if (!ready) {
    return (
      <main className="loading-shell" aria-live="polite">
        <div className="loading-mark" aria-hidden="true">J</div>
        <strong>Java Chat</strong>
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
        <div className="loading-mark" aria-hidden="true">J</div>
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

  return (
    <main className={`${theme === "dark" ? "app dark" : "app"} ${profileOpen || friendProfile ? "info-open" : ""} ${mobileChatOpen ? "mobile-chat-open" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <button
            className="current-profile"
            type="button"
            title="Open my profile"
            onClick={() => {
              setFriendProfile(undefined);
              setProfileOpen(true);
            }}
          >
            <span className="profile-mini-avatar">
              {profile?.avatarPath
                ? <img src={profile.avatarPath} alt="" />
                : (profile?.displayName || "J").slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{profile?.displayName || "Java Chat"}</strong>
              <small>{demoMode ? "Demo mode" : `@${profile?.username}`}</small>
            </span>
          </button>
          <button className="sidebar-signout" type="button" title="Sign out" onClick={signOut}>
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
        <Stories
          stories={stories}
          currentUserId={profile.id}
          onCreate={createStory}
          onDelete={deleteStory}
          onViewed={viewStory}
          onReact={reactToStory}
          onRemoveReaction={removeStoryReaction}
          onReply={replyToStory}
          onViewProfile={(profileId) => openFriendProfile(profileId)}
        />
        <ChatDiscovery
          conversations={conversations}
          activeId={active?.id}
          onSelect={(conversation) => {
            setActive(conversation);
            setFriendProfile(undefined);
            setMobileChatOpen(true);
          }}
          onStartDirect={startDirect}
          onViewProfile={(selectedProfile) => openFriendProfile(selectedProfile)}
          onCreateGroup={createGroup}
          fallbackPeople={demoMode ? demoPeople : noPeople}
        />
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
        onRefreshVoice={refreshVoiceMedia}
        onClose={() => setFriendProfile(undefined)}
        onMessage={startDirect}
      />
    </main>
  );
}
