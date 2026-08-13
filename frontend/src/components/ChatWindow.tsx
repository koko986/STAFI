import {
  Bot,
  Check,
  CheckCheck,
  ChevronLeft,
  Circle,
  CircleCheck,
  Clipboard,
  File as FileIcon,
  Flag,
  Forward,
  LoaderCircle,
  Mic,
  Moon,
  Paperclip,
  Pin,
  Reply,
  Send,
  Share2,
  Square,
  Sun,
  Trash2,
  UserRound,
  WandSparkles,
  X
} from "lucide-react";
import { ChangeEvent, FormEvent, KeyboardEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
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
  onSendMedia: (file: File, replyToMessageId?: string) => Promise<void>;
  onRefreshVoice: (messageId: string) => Promise<string>;
  onAskAi: (action: "summarize" | "draft-reply" | "question", promptOverride?: string) => void;
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
  onSendMedia,
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
  const [sendingMedia, setSendingMedia] = useState(false);
  const [voiceError, setVoiceError] = useState<string>();
  const [mediaError, setMediaError] = useState<string>();
  const [selectedMessageId, setSelectedMessageId] = useState<string>();
  const [selectedForBulk, setSelectedForBulk] = useState<string[]>([]);
  const [replyingTo, setReplyingTo] = useState<Message>();
  const [forwardingMessageId, setForwardingMessageId] = useState<string>();
  const [deleteCandidate, setDeleteCandidate] = useState<Message>();
  const [reportCandidate, setReportCandidate] = useState<Message>();
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const recorderRef = useRef<MediaRecorder>();
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  const pinnedMessages = useMemo(
    () => pinnedIds
      .map((id) => messages.find((message) => message.id === id))
      .filter((message): message is Message => Boolean(message)),
    [messages, pinnedIds]
  );

  useEffect(() => {
    setSelectedMessageId(undefined);
    setSelectedForBulk([]);
    setReplyingTo(undefined);
    setForwardingMessageId(undefined);
    setDeleteCandidate(undefined);
    setReportCandidate(undefined);
    setVoiceError(undefined);
    setMediaError(undefined);
    setNotice("");
  }, [conversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [conversation?.id, messages.length]);

  useEffect(() => {
    if (!selectedMessageId) return;
    messageRefs.current[selectedMessageId]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedMessageId]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!body.trim()) return;
    onSend(body.trim(), replyingTo?.id);
    setBody("");
    setReplyingTo(undefined);
  }

  function pickFiles(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    void sendMediaFile(file);
  }

  async function sendMediaFile(file: File) {
    setMediaError(undefined);
    if (sendingMedia) return;
    if (file.size > 200 * 1024 * 1024) {
      setMediaError("Files must be 200 MB or smaller.");
      return;
    }
    setSendingMedia(true);
    try {
      await onSendMedia(file, replyingTo?.id);
      setReplyingTo(undefined);
    } catch {
      setMediaError("The file could not be sent. Please try again.");
    } finally {
      setSendingMedia(false);
    }
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
    if (selectedForBulk.length) {
      toggleBulkSelection(message.id);
      return;
    }
    setSelectedMessageId((current) => current === message.id ? undefined : message.id);
  }

  function selectMessageWithKeyboard(event: KeyboardEvent, message: Message) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (selectedForBulk.length) {
      toggleBulkSelection(message.id);
      return;
    }
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

  function readableMessage(message: Message) {
    if (message.body) return message.body;
    if (message.type === "voice") return "Voice message";
    if (message.type === "photo") return "Photo";
    if (message.type === "video") return "Video";
    if (message.type === "file") return "Attachment";
    return "Message";
  }

  function toggleBulkSelection(messageId: string) {
    setSelectedForBulk((current) =>
      current.includes(messageId)
        ? current.filter((id) => id !== messageId)
        : [...current, messageId]
    );
  }

  function startSelection(message: Message) {
    setSelectedMessageId(undefined);
    setSelectedForBulk([message.id]);
  }

  async function copyMessage(message: Message) {
    setSelectedMessageId(undefined);
    try {
      await navigator.clipboard?.writeText(readableMessage(message));
      setNotice("Message copied.");
    } catch {
      setNotice("Could not copy this message.");
    }
  }

  async function shareSelectedMessages() {
    const selectedText = messages
      .filter((message) => selectedForBulk.includes(message.id))
      .map(readableMessage)
      .join("\n\n");
    if (!selectedText) return;
    try {
      if (navigator.share) {
        await navigator.share({ text: selectedText });
        setNotice("Shared.");
      } else {
        await navigator.clipboard?.writeText(selectedText);
        setNotice("Selected messages copied.");
      }
    } catch {
      setNotice("Could not share selected messages.");
    }
  }

  function togglePin(message: Message) {
    const isPinned = pinnedIds.includes(message.id);
    setSelectedMessageId(undefined);
    setPinnedIds((current) =>
      isPinned
        ? current.filter((id) => id !== message.id)
        : [message.id, ...current]
    );
    setNotice(isPinned ? "Message unpinned." : "Message pinned.");
  }

  function askStafi(message: Message) {
    setSelectedMessageId(undefined);
    const question = readableMessage(message);
    onAskAi("question", `Answer this question only. Do not summarize the chat: ${question}`);
  }

  function senderLabel(message: Message) {
    return message.senderId === "me" || message.senderId === currentUserId
      ? "You"
      : conversation?.title || "Chat";
  }

  if (!conversation) return <section className="chat-window empty">Choose a conversation</section>;

  return (
    <section className="chat-window">
      {selectedForBulk.length > 0 ? (
        <header className="chat-selection-header">
          <button type="button" title="Cancel selection" onClick={() => setSelectedForBulk([])}>
            <X size={21} />
          </button>
          <strong>{selectedForBulk.length} Selected</strong>
          <button
            className="select-all-button"
            type="button"
            onClick={() => setSelectedForBulk(messages.map((message) => message.id))}
          >
            Select All
          </button>
        </header>
      ) : (
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
      )}
      {notice && (
        <div className="chat-notice" role="status">
          <span>{notice}</span>
          <button type="button" title="Dismiss" onClick={() => setNotice("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {pinnedMessages.length > 0 && selectedForBulk.length === 0 && (
        <div className="pinned-message-bar">
          <button
            className="pinned-message-main"
            type="button"
            title="Jump to pinned message"
            onClick={() => {
              const pinned = pinnedMessages[0];
              const target = messageRefs.current[pinned.id];
              target?.scrollIntoView({ behavior: "smooth", block: "center" });
              setSelectedMessageId(pinned.id);
              window.setTimeout(() => setSelectedMessageId((current) => current === pinned.id ? undefined : current), 1200);
            }}
          >
            <Pin size={15} />
            <span>
              <strong>Pinned message</strong>
              <small>{readableMessage(pinnedMessages[0])}</small>
            </span>
          </button>
          <button
            className="pinned-message-close"
            type="button"
            title="Unpin message"
            onClick={() => {
              setPinnedIds((current) => current.filter((id) => id !== pinnedMessages[0].id));
              setNotice("Message unpinned.");
            }}
          >
            <X size={14} />
          </button>
        </div>
      )}      <div className={selectedForBulk.length ? "messages selection-mode" : "messages"} onClick={() => setSelectedMessageId(undefined)}>
        {messages.map((message) => {
          const mine = message.senderId === "me" || message.senderId === currentUserId;
          const selected = selectedMessageId === message.id;
          const bulkSelected = selectedForBulk.includes(message.id);
          const pinned = pinnedIds.includes(message.id);
          const bubbleClass = message.type === "ai" ? "bubble ai" : mine ? "bubble mine" : "bubble theirs";
          return (
            <article
              className={`${bubbleClass}${selected ? " selected" : ""}${bulkSelected ? " bulk-selected" : ""}${pinned ? " pinned" : ""}`}
              key={message.id}
              ref={(element) => {
                messageRefs.current[message.id] = element;
              }}
              role="button"
              tabIndex={0}
              onClick={(event) => selectMessage(event, message)}
              onKeyDown={(event) => selectMessageWithKeyboard(event, message)}
            >
              {selectedForBulk.length > 0 && (
                <button
                  className="bulk-select-dot"
                  type="button"
                  title={bulkSelected ? "Unselect message" : "Select message"}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleBulkSelection(message.id);
                  }}
                >
                  {bulkSelected ? <CircleCheck size={22} /> : <Circle size={22} />}
                </button>
              )}
              {pinned && (
                <span className="message-context pinned-context">
                  <Pin size={13} />
                  Pinned
                </span>
              )}
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
              ) : message.type === "photo" && message.mediaPath ? (
                <img className="message-media" src={message.mediaPath} alt={message.body || "Photo"} loading="lazy" />
              ) : message.type === "video" && message.mediaPath ? (
                <video className="message-media" src={message.mediaPath} controls preload="metadata" />
              ) : message.type === "file" && message.mediaPath ? (
                <a
                  className="message-file"
                  href={message.mediaPath}
                  download={message.body || "attachment"}
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="message-file-icon" aria-hidden="true">
                    <FileIcon size={22} />
                  </span>
                  <span className="message-file-copy">
                    <strong>{message.body || "Attachment"}</strong>
                    <small>Download file</small>
                  </span>
                </a>
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
              {selected && selectedForBulk.length === 0 && (
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
                    <button type="button" title="Select" onClick={() => startSelection(message)}>
                      <CircleCheck size={16} />
                      <span>Select</span>
                    </button>
                    <button type="button" title="Copy" onClick={() => copyMessage(message)}>
                      <Clipboard size={16} />
                      <span>Copy</span>
                    </button>
                    <button type="button" title={pinned ? "Unpin" : "Pin"} onClick={() => togglePin(message)}>
                      <Pin size={16} />
                      <span>{pinned ? "Unpin" : "Pin"}</span>
                    </button>
                    <button
                      type="button"
                      title="Report"
                      onClick={() => {
                        setReportCandidate(message);
                        setSelectedMessageId(undefined);
                      }}
                    >
                      <Flag size={16} />
                      <span>Report</span>
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
                    <button className="ask-stafi-action" type="button" title="Ask STAFI" onClick={() => askStafi(message)}>
                      <WandSparkles size={16} />
                      <span>Ask STAFI</span>
                    </button>
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
                try {
                  await onDelete(deleteCandidate, "me");
                  setDeleteCandidate(undefined);
                  setSelectedForBulk([]);
                  setNotice("Message deleted for you.");
                } catch {
                  setNotice("Could not delete this message for you.");
                }
              }}
            >
              Delete only for me
            </button>
            <button
              className="danger"
              type="button"
              onClick={async () => {
                try {
                  await onDelete(deleteCandidate, "all");
                  setDeleteCandidate(undefined);
                  setSelectedForBulk([]);
                  setNotice("Message deleted for everyone.");
                } catch {
                  setNotice("Could not delete for everyone. You may only be able to delete your own messages.");
                }
              }}
            >
              Delete for everyone
            </button>
          </section>
        </div>
      )}
      {reportCandidate && (
        <div className="report-backdrop" role="presentation" onClick={() => setReportCandidate(undefined)}>
          <section
            className="report-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2 id="report-title">Report Message</h2>
                <p>Select a reason for reporting.</p>
              </div>
              <button type="button" title="Close report" onClick={() => setReportCandidate(undefined)}>
                <X size={22} />
              </button>
            </header>
            {["Spam", "Child abuse", "Violence", "Illegal goods and services", "Illegal adult content", "Personal data", "Copyright", "Other"].map((reason) => (
              <button className="report-option" type="button" key={reason}>
                <Circle size={22} />
                <span>{reason}</span>
              </button>
            ))}
            <button
              className="primary-button report-submit"
              type="button"
              onClick={() => {
                setReportCandidate(undefined);
                setNotice("Report submitted.");
              }}
            >
              Submit Report
            </button>
          </section>
        </div>
      )}
      {selectedForBulk.length > 0 && (
        <div className="selection-toolbar">
          <button
            className="danger"
            type="button"
            onClick={() => {
              const first = messages.find((message) => selectedForBulk.includes(message.id));
              if (first) setDeleteCandidate(first);
            }}
          >
            <Trash2 size={20} />
            <span>Delete</span>
          </button>
          <button
            type="button"
            onClick={() => {
              const first = messages.find((message) => selectedForBulk.includes(message.id));
              if (first) setForwardingMessageId(first.id);
            }}
          >
            <Forward size={20} />
            <span>Forward</span>
          </button>
          <button type="button" onClick={shareSelectedMessages}>
            <Share2 size={20} />
            <span>Share</span>
          </button>
        </div>
      )}      <div className="composer-shell">
        {voiceError && (
          <div className="voice-error" role="alert">
            <span>{voiceError}</span>
            <button type="button" title="Dismiss error" onClick={() => setVoiceError(undefined)}>
              <X size={15} />
            </button>
          </div>
        )}
        {mediaError && (
          <div className="voice-error" role="alert">
            <span>{mediaError}</span>
            <button type="button" title="Dismiss error" onClick={() => setMediaError(undefined)}>
              <X size={15} />
            </button>
          </div>
        )}
        {replyingTo && (
          <div className="replying-bar">
            <span className="reply-accent" aria-hidden="true" />
            <span className="reply-copy">
              <strong>Reply to {senderLabel(replyingTo)}</strong>
              <small>{replyingTo.type === "voice" ? "Voice message" : replyingTo.type === "photo" ? "Photo" : replyingTo.type === "video" ? "Video" : replyingTo.type === "file" ? `File: ${replyingTo.body || "Attachment"}` : replyingTo.body}</small>
            </span>
            <button type="button" title="Cancel reply" onClick={() => setReplyingTo(undefined)}>
              <X size={16} />
            </button>
          </div>
        )}
        <form className="composer" onSubmit={submit}>
          <input
            ref={fileInputRef}
            className="composer-file-input"
            type="file"
            accept="image/*,video/*,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.md,.zip,.mp3,.m4a,.wav,.ogg,.mov"
            onChange={pickFiles}
            hidden
          />
          <button
            type="button"
            title="Attach a file, photo, or video"
            onClick={() => fileInputRef.current?.click()}
            disabled={sendingMedia || sendingVoice}
          >
            {sendingMedia ? <LoaderCircle className="spin" size={18} /> : <Paperclip size={18} />}
          </button>
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
          <button type="submit" title="Send" disabled={sendingMedia || sendingVoice}>
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
