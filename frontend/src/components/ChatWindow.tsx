import {
  Bot,
  Check,
  CheckCheck,
  ChevronLeft,
  Forward,
  LoaderCircle,
  Mic,
  Moon,
  Reply,
  Send,
  Square,
  Sun,
  Trash2,
  UserRound,
  WandSparkles,
  X
} from "lucide-react";
import { FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Conversation, Message, MessageReaction } from "../lib/api";
import { VoiceMessage } from "./VoiceMessage";

const reactionOptions: Array<{ value: MessageReaction; label: string; title: string }> = [
  { value: "heart", label: "\u2764\ufe0f", title: "Heart" },
  { value: "fire", label: "\ud83d\udd25", title: "Fire" },
  { value: "like", label: "\ud83d\udc4d", title: "Like" },
  { value: "laugh", label: "\ud83d\ude04", title: "Laugh" },
  { value: "clap", label: "\ud83d\udc4f", title: "Clap" }
];

const reactionLabels = reactionOptions.reduce<Record<MessageReaction, string>>((labels, reaction) => {
  labels[reaction.value] = reaction.label;
  return labels;
}, {} as Record<MessageReaction, string>);

type Props = {
  conversation?: Conversation;
  conversations: Conversation[];
  messages: Message[];
  currentUserId?: string;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onSend: (body: string, replyToMessageId?: string) => void;
  onSendVoice: (voice: Blob, replyToMessageId?: string) => Promise<void>;
  onRefreshVoice: (messageId: string) => Promise<string>;
  onAskAi: (action: "summarize" | "draft-reply") => void;
  onBack: () => void;
  onOpenInfo: () => void;
  onDelete: (message: Message, mode: "me" | "all") => Promise<void>;
  onForward: (message: Message, conversationId: string) => Promise<void>;
  onReact: (message: Message, reaction: MessageReaction) => Promise<void>;
  onRemoveReaction: (message: Message) => Promise<void>;
};

export function ChatWindow({
  conversation,
  conversations,
  messages,
  currentUserId,
  theme,
  onToggleTheme,
  onSend,
  onSendVoice,
  onRefreshVoice,
  onAskAi,
  onBack,
  onOpenInfo,
  onDelete,
  onForward,
  onReact,
  onRemoveReaction
}: Props) {
  const [body, setBody] = useState("");
  const [recording, setRecording] = useState(false);
  const [sendingVoice, setSendingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string>();
  const [selectedMessageId, setSelectedMessageId] = useState<string>();
  const [replyingTo, setReplyingTo] = useState<Message>();
  const [forwardingMessageId, setForwardingMessageId] = useState<string>();
  const [deleteCandidate, setDeleteCandidate] = useState<Message>();
  const recorderRef = useRef<MediaRecorder>();
  const chunksRef = useRef<Blob[]>([]);
  const messageRefs = useRef<Record<string, HTMLElement | null>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const forwardingMessage = useMemo(
    () => messages.find((message) => message.id === forwardingMessageId),
    [forwardingMessageId, messages]
  );
  const forwardTargets = useMemo(
    () => conversations.filter((item) => item.id !== conversation?.id),
    [conversation?.id, conversations]
  );

  useEffect(() => {
    setSelectedMessageId(undefined);
    setReplyingTo(undefined);
    setForwardingMessageId(undefined);
    setDeleteCandidate(undefined);
    setVoiceError(undefined);
  }, [conversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [conversation?.id, messages.length]);

  useEffect(() => {
    if (!selectedMessageId) return;
    messageRefs.current[selectedMessageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedMessageId]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    onSend(body.trim(), replyingTo?.id);
    setBody("");
    setReplyingTo(undefined);
  }

  async function toggleRecording() {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }

    setVoiceError(undefined);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Voice recording is not supported by this browser.");
      return;
    }

    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const supportedType = [
        "audio/mp4;codecs=mp4a.40.2",
        "audio/mp4",
        "audio/webm;codecs=opus",
        "audio/ogg;codecs=opus"
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = supportedType
        ? new MediaRecorder(stream, { mimeType: supportedType })
        : new MediaRecorder(stream);
      const replyToMessageId = replyingTo?.id;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        stream?.getTracks().forEach((track) => track.stop());
        setRecording(false);
        setVoiceError("Recording failed. Please check your microphone and try again.");
      };
      recorder.onstop = async () => {
        stream?.getTracks().forEach((track) => track.stop());
        recorderRef.current = undefined;
        setRecording(false);
        const voice = new Blob(chunksRef.current, {
          type: recorder.mimeType || chunksRef.current[0]?.type || "audio/webm"
        });
        if (!voice.size) {
          setVoiceError("No audio was recorded. Please try again.");
          return;
        }
        setSendingVoice(true);
        try {
          await onSendVoice(voice, replyToMessageId);
          setReplyingTo(undefined);
        } catch {
          setVoiceError("The voice message could not be sent. Please try again.");
        } finally {
          setSendingVoice(false);
        }
      };
      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      setRecording(false);
      setVoiceError("Microphone access is required to record a voice message.");
    }
  }

  function selectMessage(event: MouseEvent, message: Message) {
    event.stopPropagation();
    setSelectedMessageId((current) => current === message.id ? undefined : message.id);
  }

  function selectMessageWithKeyboard(event: KeyboardEvent, message: Message) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setSelectedMessageId((current) => current === message.id ? undefined : message.id);
  }

  async function toggleReaction(message: Message, reaction: MessageReaction) {
    setSelectedMessageId(undefined);
    if (message.ownReaction === reaction) {
      await onRemoveReaction(message);
    } else {
      await onReact(message, reaction);
    }
  }

  function jumpToMessage(event: MouseEvent, messageId?: string) {
    event.stopPropagation();
    if (!messageId) return;
    const target = messageRefs.current[messageId];
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    setSelectedMessageId(messageId);
    window.setTimeout(() => setSelectedMessageId((current) => current === messageId ? undefined : current), 1400);
  }

  function senderLabel(message: Message) {
    return message.senderId === "me" || message.senderId === currentUserId
      ? "You"
      : conversation?.title || "Chat";
  }

  if (!conversation) return <section className="chat-window empty">Choose a conversation</section>;

  return (
    <section className="chat-window">
      <header className="chat-header">
        <button className="mobile-back" type="button" title="Back to chats" onClick={onBack}>
          <ChevronLeft size={20} />
        </button>
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
      <div className="messages" onClick={() => setSelectedMessageId(undefined)}>
        {messages.map((message) => {
          const mine = message.senderId === "me" || message.senderId === currentUserId;
          const selected = selectedMessageId === message.id;
          const bubbleClass = message.type === "ai" ? "bubble ai" : mine ? "bubble mine" : "bubble theirs";
          return (
            <article
              className={`${bubbleClass}${selected ? " selected" : ""}`}
              key={message.id}
              ref={(element) => {
                messageRefs.current[message.id] = element;
              }}
              role="button"
              tabIndex={0}
              onClick={(event) => selectMessage(event, message)}
              onKeyDown={(event) => selectMessageWithKeyboard(event, message)}
            >
              {message.forwarded && (
                <span className="message-context">
                  <Forward size={13} />
                  Forwarded
                </span>
              )}
              {message.replyPreview && (
                <button
                  className="message-reply-preview"
                  type="button"
                  onClick={(event) => jumpToMessage(event, message.replyToMessageId)}
                >
                  <span className="reply-accent" aria-hidden="true" />
                  <span className="reply-copy">
                    <strong>
                      {messages.find((item) => item.id === message.replyToMessageId)
                        ? senderLabel(messages.find((item) => item.id === message.replyToMessageId)!)
                        : "Original message"}
                    </strong>
                    <small>{message.replyPreview}</small>
                  </span>
                </button>
              )}
              {message.type === "voice" ? (
                <VoiceMessage
                  message={message}
                  onRefresh={onRefreshVoice}
                  onOpenActions={(event) => selectMessage(event, message)}
                />
              ) : <p>{message.body}</p>}
              <footer className="message-footer">
                <ReactionSummary message={message} onToggle={toggleReaction} />
                <span className="message-meta">
                  <time dateTime={message.createdAt}>
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </time>
                  {mine && <MessageStatus status={message.status || "sent"} />}
                </span>
              </footer>
              {selected && (
                <div className="message-actions" onClick={(event) => event.stopPropagation()}>
                  <div className="reaction-picker" aria-label="Message reactions">
                    {reactionOptions.map((reaction) => (
                      <button
                        className={message.ownReaction === reaction.value ? "active" : ""}
                        type="button"
                        title={reaction.title}
                        key={reaction.value}
                        onClick={() => toggleReaction(message, reaction.value)}
                      >
                        {reaction.label}
                      </button>
                    ))}
                  </div>
                  <div className="message-command-row">
                    <button
                      type="button"
                      title="Reply"
                      onClick={() => {
                        setReplyingTo(message);
                        setSelectedMessageId(undefined);
                      }}
                    >
                      <Reply size={16} />
                      <span>Reply</span>
                    </button>
                    <button
                      type="button"
                      title="Forward"
                      onClick={() => {
                        setForwardingMessageId(message.id);
                        setSelectedMessageId(undefined);
                      }}
                    >
                      <Forward size={16} />
                      <span>Forward</span>
                    </button>
                    {message.senderId && (
                      <button
                        className="danger"
                        type="button"
                        title="Delete"
                        onClick={() => {
                          setDeleteCandidate(message);
                          setSelectedMessageId(undefined);
                        }}
                      >
                        <Trash2 size={16} />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </article>
          );
        })}
        <div ref={messagesEndRef} />
      </div>
      {forwardingMessage && (
        <div className="forward-panel">
          <div>
            <strong>Forward to</strong>
            <button type="button" title="Close forward menu" onClick={() => setForwardingMessageId(undefined)}>
              <X size={16} />
            </button>
          </div>
          {forwardTargets.length ? (
            <div className="forward-targets">
              {forwardTargets.map((target) => (
                <button
                  type="button"
                  key={target.id}
                  onClick={async () => {
                    await onForward(forwardingMessage, target.id);
                    setForwardingMessageId(undefined);
                  }}
                >
                  <span className="avatar">
                    {target.profile?.avatarPath ? <img src={target.profile.avatarPath} alt="" /> : target.title.slice(0, 1)}
                  </span>
                  <span>{target.title}</span>
                </button>
              ))}
            </div>
          ) : <small>No other chats yet</small>}
        </div>
      )}
      {deleteCandidate && (
        <div className="delete-choice-backdrop" role="presentation" onClick={() => setDeleteCandidate(undefined)}>
          <section
            className="delete-choice-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-choice-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <strong id="delete-choice-title">Delete message?</strong>
              <button type="button" title="Close delete menu" onClick={() => setDeleteCandidate(undefined)}>
                <X size={17} />
              </button>
            </header>
            <p>Choose how this message should be removed.</p>
            <button
              type="button"
              onClick={async () => {
                await onDelete(deleteCandidate, "me");
                setDeleteCandidate(undefined);
              }}
            >
              Delete only for me
            </button>
            {(deleteCandidate.senderId === "me" || deleteCandidate.senderId === currentUserId) && (
              <button
                className="danger"
                type="button"
                onClick={async () => {
                  await onDelete(deleteCandidate, "all");
                  setDeleteCandidate(undefined);
                }}
              >
                Delete for everyone
              </button>
            )}
          </section>
        </div>
      )}
      <div className="composer-shell">
        {voiceError && (
          <div className="voice-error" role="alert">
            <span>{voiceError}</span>
            <button type="button" title="Dismiss error" onClick={() => setVoiceError(undefined)}>
              <X size={15} />
            </button>
          </div>
        )}
        {replyingTo && (
          <div className="replying-bar">
            <span className="reply-accent" aria-hidden="true" />
            <span className="reply-copy">
              <strong>Reply to {senderLabel(replyingTo)}</strong>
              <small>{replyingTo.type === "voice" ? "Voice message" : replyingTo.body}</small>
            </span>
            <button type="button" title="Cancel reply" onClick={() => setReplyingTo(undefined)}>
              <X size={16} />
            </button>
          </div>
        )}
        <form className="composer" onSubmit={submit}>
          <button
            className={recording ? "recording" : ""}
            type="button"
            title={recording ? "Stop recording" : sendingVoice ? "Sending voice message" : "Record voice"}
            onClick={toggleRecording}
            disabled={sendingVoice}
          >
            {sendingVoice ? <LoaderCircle className="spin" size={18} /> : recording ? <Square size={16} /> : <Mic size={18} />}
          </button>
          <input value={body} onChange={(event) => setBody(event.target.value)} placeholder={replyingTo ? "Reply..." : "Message..."} />
          <button type="submit" title="Send">
            <Send size={18} />
          </button>
        </form>
      </div>
    </section>
  );
}

function ReactionSummary({
  message,
  onToggle
}: {
  message: Message;
  onToggle: (message: Message, reaction: MessageReaction) => Promise<void>;
}) {
  const reactions = Object.entries(message.reactions || {}) as Array<[MessageReaction, number]>;
  if (!reactions.length) return null;
  return (
    <span className="message-reactions">
      {reactions.map(([reaction, count]) => (
        <button
          className={message.ownReaction === reaction ? "own" : ""}
          key={reaction}
          type="button"
          title={`${reactionOptions.find((item) => item.value === reaction)?.title || "Reaction"}: ${count}`}
          onClick={(event) => {
            event.stopPropagation();
            void onToggle(message, reaction);
          }}
        >
          <span>{reactionLabels[reaction]}</span>
          {count > 1 && <small>{count}</small>}
        </button>
      ))}
    </span>
  );
}

function MessageStatus({ status }: { status: "sent" | "delivered" | "seen" }) {
  const Icon = status === "sent" ? Check : CheckCheck;
  return (
    <span className={`message-status ${status}`} title={status}>
      <Icon size={13} />
    </span>
  );
}
