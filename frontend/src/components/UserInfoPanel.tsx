import {
  AtSign,
  Bell,
  Images,
  Info,
  Link2,
  MessageCircle,
  Mic2,
  X
} from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import type { Message, Profile, Story } from "../lib/api";
import { VoiceMessage } from "./VoiceMessage";

type Props = {
  profile?: Profile;
  messages: Message[];
  onClose: () => void;
  onMessage: (profile: Profile) => Promise<void>;
  onRefreshVoice: (messageId: string) => Promise<string>;
  stories?: Story[];
  onOpenStories?: (profileId: string) => void;
};

type SharedTab = "media" | "voice" | "links";

export function UserInfoPanel({
  profile,
  messages,
  onClose,
  onMessage,
  onRefreshVoice,
  stories = [],
  onOpenStories
}: Props) {
  const [tab, setTab] = useState<SharedTab>("media");
  const [notifications, setNotifications] = useState(true);
  const voiceMessages = useMemo(
    () => messages.filter((message) => message.type === "voice" && message.mediaPath),
    [messages]
  );
  const links = useMemo(
    () => messages.flatMap((message) => message.body?.match(/https?:\/\/[^\s]+/g) || []),
    [messages]
  );
  const profileStories = useMemo(
    () => profile ? stories.filter((story) => story.ownerId === profile.id) : [],
    [profile, stories]
  );

  useEffect(() => {
    if (!profile) return;
    setTab("media");
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, profile]);

  if (!profile) return null;

  return (
    <aside className="user-info-panel" aria-labelledby="user-info-title">
      <header className="user-info-toolbar">
        <button className="icon-button" type="button" title="Close user info" onClick={onClose}>
          <X size={21} />
        </button>
        <h2 id="user-info-title">User Info</h2>
      </header>

      <div className="user-info-scroll">
        <div className="user-info-identity">
          <button
            className={profileStories.length ? "user-info-avatar story-ready" : "user-info-avatar"}
            type="button"
            title={profileStories.length ? "View story" : "No active story"}
            onClick={() => {
              if (profileStories.length) onOpenStories?.(profile.id);
            }}
            disabled={!profileStories.length}
          >
            {profile.avatarPath
              ? <img src={profile.avatarPath} alt="" />
              : <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>}
          </button>
          <h3>{profile.displayName}</h3>
          <p>{profileStories.length ? `${profileStories.length} active story${profileStories.length > 1 ? "s" : ""}` : "online"}</p>
        </div>

        <div className="user-info-section">
          <div className="user-info-row">
            <AtSign size={21} />
            <span>
              <strong>@{profile.username}</strong>
              <small>Username</small>
            </span>
          </div>
          <div className="user-info-row">
            <Info size={21} />
            <span>
              <strong>{profile.bio || "No bio yet"}</strong>
              <small>Bio</small>
            </span>
          </div>
          <button
            className="user-info-row notification-row"
            type="button"
            onClick={() => setNotifications((current) => !current)}
          >
            <Bell size={21} />
            <span>
              <strong>Notifications</strong>
              <small>{notifications ? "On" : "Muted"}</small>
            </span>
            <span className={`info-switch ${notifications ? "active" : ""}`} aria-hidden="true">
              <span />
            </span>
          </button>
        </div>

        <button
          className="user-info-message"
          type="button"
          onClick={async () => {
            await onMessage(profile);
            onClose();
          }}
        >
          <MessageCircle size={19} />
          Message
        </button>

        <div className="user-info-shared">
          <div className="user-info-tabs" role="tablist" aria-label="Shared content">
            {(["media", "voice", "links"] as SharedTab[]).map((item) => (
              <button
                className={tab === item ? "active" : ""}
                type="button"
                role="tab"
                aria-selected={tab === item}
                onClick={() => setTab(item)}
                key={item}
              >
                {item.slice(0, 1).toUpperCase() + item.slice(1)}
                {item === "voice" && voiceMessages.length > 0 && <small>{voiceMessages.length}</small>}
                {item === "links" && links.length > 0 && <small>{links.length}</small>}
              </button>
            ))}
          </div>

          <div className="user-info-tab-content">
            {tab === "media" && <Empty icon={<Images size={25} />} label="No shared media" />}
            {tab === "voice" && (
              voiceMessages.length ? (
                <div className="user-info-voice-list">
                  {voiceMessages.map((message) => (
                    <VoiceMessage compact message={message} onRefresh={onRefreshVoice} key={message.id} />
                  ))}
                </div>
              ) : <Empty icon={<Mic2 size={25} />} label="No voice messages" />
            )}
            {tab === "links" && (
              links.length ? (
                <div className="user-info-links">
                  {links.map((link, index) => (
                    <a href={link} target="_blank" rel="noreferrer" key={`${link}-${index}`}>
                      <Link2 size={16} />
                      <span>{link}</span>
                    </a>
                  ))}
                </div>
              ) : <Empty icon={<Link2 size={25} />} label="No shared links" />
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}

function Empty({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="user-info-empty">
      {icon}
      <span>{label}</span>
    </div>
  );
}
