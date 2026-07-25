import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import { useEffect, useMemo, useState } from "react";
import { ChatWindow } from "./components/ChatWindow";
import { ConversationList } from "./components/ConversationList";
import { Login } from "./components/Login";
import { Stories } from "./components/Stories";
import { apiGet, apiPost, type Conversation, type Message, type Story } from "./lib/api";
import { storeMedia } from "./lib/media";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const fallbackConversations: Conversation[] = [
  { id: "11111111-1111-1111-1111-111111111111", type: "direct", title: "Mingalar" },
  { id: "22222222-2222-2222-2222-222222222222", type: "group", title: "Project Team" },
  { id: "33333333-3333-3333-3333-333333333333", type: "ai_private", title: "AI Assistant" }
];

export function App() {
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [loggedIn, setLoggedIn] = useState(!isSupabaseConfigured);
  const [demoMode, setDemoMode] = useState(!isSupabaseConfigured);
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("java-chat-theme") as "light" | "dark") || "light"
  );
  const [conversations, setConversations] = useState<Conversation[]>(fallbackConversations);
  const [active, setActive] = useState<Conversation>(fallbackConversations[0]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [stories, setStories] = useState<Story[]>([]);

  const activeMessages = useMemo(
    () => messages.filter((message) => message.conversationId === active.id),
    [active.id, messages]
  );

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setLoggedIn(Boolean(data.session));
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(Boolean(session));
      setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    apiGet<Conversation[]>("/api/conversations")
      .then((items) => {
        if (items.length) {
          setConversations(items);
          setActive(items[0]);
        }
      })
      .catch(() => setConversations(fallbackConversations));
    apiGet<Story[]>("/api/stories").then(setStories).catch(() => undefined);
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    apiGet<Message[]>(`/api/conversations/${active.id}/messages`)
      .then((items) => {
        setMessages((current) => [
          ...current.filter((message) => message.conversationId !== active.id),
          ...items
        ]);
      })
      .catch(() => undefined);
  }, [active.id, loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
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
  }, [active.id, loggedIn]);

  async function send(body: string) {
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
    const mediaPath = await storeMedia("voice-messages", voice, "webm");
    const id = crypto.randomUUID();
    const message: Message = {
      id,
      conversationId: active.id,
      senderId: "me",
      type: "voice",
      mediaPath,
      createdAt: new Date().toISOString()
    };
    setMessages((current) => [...current, message]);
    await apiPost<Message>("/api/messages", {
      id,
      conversationId: active.id,
      type: "voice",
      mediaPath
    }).catch(() => undefined);
  }

  async function createStory(file: File) {
    const extension = file.name.split(".").pop() || (file.type.startsWith("video") ? "webm" : "jpg");
    const mediaPath = await storeMedia("stories", file, extension);
    const localStory: Story = {
      id: crypto.randomUUID(),
      ownerId: "me",
      mediaPath,
      caption: "My Story",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString()
    };
    setStories((current) => [...current, localStory]);
    const saved = await apiPost<Story>("/api/stories", { mediaPath, caption: "My Story" }).catch(() => undefined);
    if (saved) {
      setStories((current) => [...current.filter((story) => story.id !== localStory.id), saved]);
    }
  }

  async function askAi(action: "summarize" | "draft-reply") {
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
  }

  if (!ready) return null;
  if (!loggedIn) {
    return <Login onDemo={() => { setDemoMode(true); setLoggedIn(true); }} />;
  }

  return (
    <main className={theme === "dark" ? "app dark" : "app"}>
      <aside className="sidebar">
        <div className="brand">
          <div>
            <strong>Java Chat</strong>
            {demoMode && <small>Demo mode</small>}
          </div>
          <button onClick={signOut}>Sign out</button>
        </div>
        <Stories stories={stories} onCreate={createStory} />
        <ConversationList conversations={conversations} activeId={active.id} onSelect={setActive} />
      </aside>
      <ChatWindow
        conversation={active}
        messages={activeMessages}
        theme={theme}
        onToggleTheme={toggleTheme}
        onSend={send}
        onSendVoice={sendVoice}
        onAskAi={askAi}
      />
    </main>
  );
}
