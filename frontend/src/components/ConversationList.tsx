import { Bot, MessageCircle, Users } from "lucide-react";
import type { Conversation } from "../lib/api";

type Props = {
  conversations: Conversation[];
  activeId?: string;
  unreadCounts: Record<string, number>;
  onlineUserIds: Set<string>;
  conversationPreviews: Record<string, string>;
  onSelect: (conversation: Conversation) => void;
};

function presenceFor(conversation: Conversation, onlineUserIds: Set<string>) {
  if (conversation.type === "ai_private") return { online: true, label: "AI online" };
  if (conversation.type === "group") return { online: false, label: "Group chat" };
  return conversation.profile?.id && onlineUserIds.has(conversation.profile.id)
    ? { online: true, label: "Online" }
    : { online: false, label: "Offline" };
}

export function ConversationList({
  conversations,
  activeId,
  unreadCounts,
  onlineUserIds,
  conversationPreviews,
  onSelect
}: Props) {
  return (
    <nav className="conversation-list" aria-label="Conversations">
      {conversations.map((conversation) => {
        const Icon = conversation.type === "group" ? Users : conversation.type === "ai_private" ? Bot : MessageCircle;
        const presence = presenceFor(conversation, onlineUserIds);
        const unread = unreadCounts[conversation.id] || 0;
        const preview = conversationPreviews[conversation.id];
        return (
          <button
            className={`${conversation.id === activeId ? "conversation active" : "conversation"} ${presence.online ? "online" : "offline"} ${unread ? "unread" : ""}`}
            key={conversation.id}
            onClick={() => onSelect(conversation)}
          >
            <span className="avatar">
              {conversation.profile?.avatarPath
                ? <img src={conversation.profile.avatarPath} alt="" />
                : <Icon size={18} />}
            </span>
            <span className="conversation-copy">
              <strong>{conversation.title}</strong>
              {preview ? (
                <small className={unread ? "message-preview unread-preview" : "message-preview"}>
                  {preview}
                </small>
              ) : (
                <small className="presence-line">
                  <i aria-hidden="true" />
                  {presence.label}
                </small>
              )}
            </span>
            {unread > 0 && (
              <span className="unread-indicator">
                <strong className="unread-badge" aria-label={`${unread} unread messages`}>
                  {unread > 99 ? "99+" : unread}
                </strong>
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
