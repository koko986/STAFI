import { Bot, MessageCircle, Users } from "lucide-react";
import type { Conversation } from "../lib/api";

type Props = {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (conversation: Conversation) => void;
};

export function ConversationList({ conversations, activeId, onSelect }: Props) {
  return (
    <nav className="conversation-list" aria-label="Conversations">
      {conversations.map((conversation) => {
        const Icon = conversation.type === "group" ? Users : conversation.type === "ai_private" ? Bot : MessageCircle;
        return (
          <button
            className={conversation.id === activeId ? "conversation active" : "conversation"}
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
              <small>{conversation.type === "ai_private" ? "AI assistant" : "Tap to open chat"}</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
