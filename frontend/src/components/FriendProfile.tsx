import { AtSign, Info, MessageCircle, UserRound, X } from "lucide-react";
import { useEffect } from "react";
import type { Profile } from "../lib/api";

type Props = {
  profile?: Profile;
  onClose: () => void;
  onMessage: (profile: Profile) => Promise<void>;
};

export function FriendProfile({ profile, onClose, onMessage }: Props) {
  useEffect(() => {
    if (!profile) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose, profile]);

  if (!profile) return null;

  return (
    <div
      className="profile-details-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="profile-details" role="dialog" aria-modal="true" aria-labelledby="friend-profile-title">
        <header className="profile-details-toolbar">
          <h2 id="friend-profile-title">Profile</h2>
          <button className="icon-button" type="button" title="Close profile" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <div className="profile-details-identity">
          <span className="profile-details-avatar">
            {profile.avatarPath
              ? <img src={profile.avatarPath} alt="" />
              : <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>}
          </span>
          <h3>{profile.displayName}</h3>
          <p>contact</p>
        </div>
        <div className="profile-info-list">
          <div className="profile-info-row">
            <AtSign size={20} />
            <span>
              <strong>@{profile.username}</strong>
              <small>Username</small>
            </span>
          </div>
          <div className="profile-info-row">
            <Info size={20} />
            <span>
              <strong>{profile.bio || "No bio yet"}</strong>
              <small>Bio</small>
            </span>
          </div>
          <div className="profile-info-row profile-info-hint">
            <UserRound size={20} />
            <span>
              <strong>Connected profile</strong>
              <small>You can message each other and share contact-only stories.</small>
            </span>
          </div>
        </div>
        <div className="friend-profile-actions">
          <button
            className="primary-button"
            type="button"
            onClick={async () => {
              await onMessage(profile);
              onClose();
            }}
          >
            <MessageCircle size={18} />
            Message
          </button>
        </div>
      </section>
    </div>
  );
}
