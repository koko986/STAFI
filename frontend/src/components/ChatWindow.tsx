import { Bot, Mic, Moon, Send, Square, Sun, UserRound, WandSparkles } from "lucide-react";
import { FormEvent, useRef, useState } from "react";
import type { Conversation, Message } from "../lib/api";

type Props = {
  conversation?: Conversation;
  messages: Message[];
  currentUserId?: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onSend: (body: string) => void;
  onSendVoice: (voice: Blob) => Promise<void>;
  onAskAi: (action: "summarize" | "draft-reply") => void;
  onOpenInfo: () => void;
};

export function ChatWindow({
  conversation,
  messages,
  currentUserId,
  theme,
  onToggleTheme,
  onSend,
  onSendVoice,
  onAskAi,
  onOpenInfo
}: Props) {
  const [body, setBody] = useState("");
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder>();
  const chunksRef = useRef<Blob[]>([]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    onSend(body.trim());
    setBody("");
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      setRecording(false);
      await onSendVoice(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
    };
    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
  }

  if (!conversation) return <section className="chat-window empty">Choose a conversation</section>;

  return (
    <section className="chat-window">
      <header className="chat-header">
        <button
          className="chat-identity"
          type="button"
          title={conversation.profile ? "Open user info" : "Conversation details"}
          onClick={onOpenInfo}
          disabled={!conversation.profile}
        >
          <span className="avatar">
            {conversation.profile?.avatarPath
              ? <img src={conversation.profile.avatarPath} alt="" />
              : <UserRound size={19} />}
          </span>
          <span>
            <strong>{conversation.title}</strong>
            <small>{conversation.profile ? `@${conversation.profile.username}` : "Online now"}</small>
          </span>
        </button>
        <div className="header-actions">
          <button title="Summarize with AI" onClick={() => onAskAi("summarize")}>
            <Bot size={18} />
          </button>
          <button title="Draft a reply with AI" onClick={() => onAskAi("draft-reply")}>
            <WandSparkles size={18} />
          </button>
          <button title="Toggle theme" onClick={onToggleTheme}>
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>
      <div className="messages">
        {messages.map((message) => (
          <article className={message.type === "ai" ? "bubble ai" : message.senderId === "me" || message.senderId === currentUserId ? "bubble mine" : "bubble theirs"} key={message.id}>
            {message.type === "voice" ? <audio controls src={message.mediaPath} /> : <p>{message.body}</p>}
          </article>
        ))}
      </div>
      <form className="composer" onSubmit={submit}>
        <button className={recording ? "recording" : ""} type="button" title={recording ? "Stop recording" : "Record voice"} onClick={toggleRecording}>
          {recording ? <Square size={16} /> : <Mic size={18} />}
        </button>
        <input value={body} onChange={(event) => setBody(event.target.value)} placeholder="Message..." />
        <button type="submit" title="Send">
          <Send size={18} />
        </button>
      </form>
    </section>
  );
}
