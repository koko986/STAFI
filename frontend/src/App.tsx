import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useEffect, useMemo, useState } from "react";
import { ChatDiscovery } from "./components/ChatDiscovery";
import { ChatWindow } from "./components/ChatWindow";
import { Login } from "./components/Login";
import { ProfileDetails } from "./components/ProfileDetails";
import { ProfileOnboarding } from "./components/ProfileOnboarding";
import { Stories } from "./components/Stories";
import { apiGet, apiPost, apiPut, type Conversation, type Message, type Profile, type Story } from "./lib/api";
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
    () => active ? messages.filter((message) => message.conversationId === active.id) : [],
    [active, messages]
  );

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
    apiGet<Story[]>("/api/stories").then(setStories).catch(() => undefined);
  }, [demoMode, loggedIn, profile?.onboarded]);

  useEffect(() => {
    if (!loggedIn || !active) return;
    apiGet<Message[]>(`/api/conversations/${active.id}/messages`)
      .then((items) => {
        setMessages((current) => [
          ...current.filter((message) => message.conversationId !== active.id),
          ...items
        ]);
      })
      .catch(() => undefined);
  }, [active, loggedIn]);

  useEffect(() => {
    if (!loggedIn || !active) return;
    const client = new Client({
      webSocketFactory: () => new SockJS(import.meta.env.VITE_WS_URL || "http://localhost:8080/ws"),
      reconnectDelay: 5000,
      onConnect: () => {
        client.subscribe(`/topic/conversations/${active.id}`, (frame) => {
          const incoming = JSON.parse(frame.body) as Message;
          setMessages((current) =>
            current.some((message) => message.id === incoming.id) ? current : [...current, incoming]
          );
        });
      }
    });
    client.activate();
    return () => {
      client.deactivate();
    };
  }, [active, loggedIn]);

  async function send(body: string) {
    if (!active) return;
    const id = crypto.randomUUID();
    const optimistic: Message = {
      id,
      conversationId: active.id,
      senderId: "me",
      type: "text",
      body,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, optimistic]);
    await apiPost<Message>("/api/messages", { id, conversationId: active.id, type: "text", body }).catch(() => undefined);
  }

  async function sendVoice(voice: Blob) {
    if (!active) return;
    const uploaded = await uploadMedia("voice-messages", voice, "webm");
    const id = crypto.randomUUID();
    const message: Message = {
      id,
      conversationId: active.id,
      senderId: "me",
      type: "voice",
      mediaPath: uploaded.url,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, message]);
    await apiPost<Message>("/api/messages", {
      id,
      conversationId: active.id,
      type: "voice",
      mediaPath: uploaded.path
    }).catch(() => undefined);
  }

  async function createStory(file: File) {
    const extension = file.name.split(".").pop() || (file.type.startsWith("video") ? "webm" : "jpg");
    const uploaded = await uploadMedia("stories", file, extension);
    const localStory: Story = {
      id: crypto.randomUUID(),
      ownerId: "me",
      mediaPath: uploaded.url,
      caption: "My Story",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString()
    };
    setStories((current) => [...current, localStory]);
    const saved = await apiPost<Story>("/api/stories", {
      mediaPath: uploaded.path,
      caption: "My Story"
    }).catch(() => undefined);
    if (saved) {
      setStories((current) => [...current.filter((story) => story.id !== localStory.id), saved]);
    }
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
          title: profileToChat.displayName
        }
      : await apiPost<Conversation>("/api/conversations/direct", {
          profileId: profileToChat.id
        });

    setConversations((current) =>
      current.some((item) => item.id === conversation.id) ? current : [conversation, ...current]
    );
    setActive(conversation);
  }

  async function createGroup(title: string, memberIds: string[]) {
    const conversation: Conversation = demoMode
      ? { id: crypto.randomUUID(), type: "group", title }
      : await apiPost<Conversation>("/api/conversations/groups", { title, memberIds });
    setConversations((current) => [conversation, ...current]);
    setActive(conversation);
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
    <main className={theme === "dark" ? "app dark" : "app"}>
      <aside className="sidebar">
        <div className="brand">
          <button
            className="current-profile"
            type="button"
            title="Open my profile"
            onClick={() => setProfileOpen(true)}
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
          <button onClick={signOut}>Sign out</button>
        </div>
        <Stories stories={stories} onCreate={createStory} />
        <ChatDiscovery
          conversations={conversations}
          activeId={active?.id}
          onSelect={setActive}
          onStartDirect={startDirect}
          onCreateGroup={createGroup}
          fallbackPeople={demoMode ? demoPeople : noPeople}
        />
      </aside>
      <ChatWindow
        conversation={active}
        messages={activeMessages}
        currentUserId={profile?.id}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSend={send}
        onSendVoice={sendVoice}
        onAskAi={askAi}
      />
      <ProfileDetails
        profile={profile}
        accountContact={accountContact}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onSave={saveProfile}
      />
    </main>
  );
}
