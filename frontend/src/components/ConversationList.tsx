import { Bot, MessageCircle, Users } from "lucide-react";
import type { Conversation } from "../lib/api";

type Props = {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (conversation: Conversation) => void;
};

function presenceFor(conversation: Conversation) {
  if (conversation.type === "ai_private") return { online: true, label: "AI online" };
  if (conversation.type === "group") return { online: true, label: "Active group" };
  return conversation.profile
    ? { online: true, label: "Online" }
    : { online: false, label: "Offline" };
}

export function ConversationList({ conversations, activeId, onSelect }: Props) {
  return (
    <nav className="conversation-list" aria-label="Conversations">
      {conversations.map((conversation) => {
        const Icon = conversation.type === "group" ? Users : conversation.type === "ai_private" ? Bot : MessageCircle;
        const presence = presenceFor(conversation);
        return (
          <button
            className={`${conversation.id === activeId ? "conversation active" : "conversation"} ${presence.online ? "online" : "offline"}`}
            key={conversation.id}
            onClick={() => onSelect(conversation)}
          >
            <span className="avatar">
              {conversation.profile?.avatarPath
                ? <img src={conversation.profile.avatarPath} alt="" />
                : <Icon size={18} />}
            </span>
            <span>
              <strong>{conversation.title}</strong>
              <small className="presence-line">
                <i aria-hidden="true" />
                {presence.label}
              </small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
