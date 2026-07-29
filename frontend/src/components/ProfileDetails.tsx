import { AtSign, Camera, Info, Mail, Pencil, Phone, UserRound, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { type Profile } from "../lib/api";
import { storeMedia } from "../lib/media";

type Props = {
  profile: Profile;
  accountContact?: string;
  open: boolean;
  onClose: () => void;
  onSave: (profile: Profile) => Promise<void>;
};

export function ProfileDetails({ profile, accountContact, open, onClose, onSave }: Props) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio || "");
  const [avatarFile, setAvatarFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const avatarPreview = useMemo(
    () => avatarFile ? URL.createObjectURL(avatarFile) : profile.avatarPath,
    [avatarFile, profile.avatarPath]
  );

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setDisplayName(profile.displayName);
    setUsername(profile.username);
    setBio(profile.bio || "");
    setAvatarFile(undefined);
    setStatus("");

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, onClose, profile]);

  useEffect(() => {
    return () => {
      if (avatarFile && avatarPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(avatarPreview);
      }
    };
  }, [avatarFile, avatarPreview]);

  if (!open) return null;

  function cancelEdit() {
    setEditing(false);
    setDisplayName(profile.displayName);
    setUsername(profile.username);
    setBio(profile.bio || "");
    setAvatarFile(undefined);
    setStatus("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (displayName.trim().length < 2) {
      setStatus("Your display name must contain at least 2 characters.");
      return;
    }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setStatus("Username must be 3-24 lowercase letters, numbers, or underscores.");
      return;
    }

    setBusy(true);
    setStatus("");
    try {
      let avatarPath = profile.avatarPath;
      if (avatarFile) {
        const extension = avatarFile.name.split(".").pop() || "jpg";
        avatarPath = await storeMedia("avatars", avatarFile, extension);
      }
      await onSave({
        ...profile,
        displayName: displayName.trim(),
        username,
        bio: bio.trim(),
        avatarPath
      });
      setEditing(false);
      setAvatarFile(undefined);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update your profile.");
    } finally {
      setBusy(false);
    }
  }

  const contactIsPhone = Boolean(accountContact?.trim().startsWith("+"));

  return (
    <div
      className="profile-details-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="profile-details" role="dialog" aria-modal="true" aria-labelledby="my-profile-title">
        <header className="profile-details-toolbar">
          <h2 id="my-profile-title">{editing ? "Edit profile" : "My profile"}</h2>
          <span className="profile-toolbar-actions">
            {!editing && (
              <button className="icon-button" type="button" title="Edit profile" onClick={() => setEditing(true)}>
                <Pencil size={18} />
              </button>
            )}
            <button className="icon-button" type="button" title="Close profile" onClick={onClose}>
              <X size={20} />
            </button>
          </span>
        </header>

        {editing ? (
          <form className="profile-details-form" onSubmit={save}>
            <label className="profile-photo-editor">
              <span className="profile-details-avatar">
                {avatarPreview
                  ? <img src={avatarPreview} alt="" />
                  : <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>}
                <span className="profile-photo-overlay"><Camera size={22} /></span>
              </span>
              <span>Change profile photo</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => setAvatarFile(event.target.files?.[0])}
              />
            </label>

            <label>
              Display name
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                maxLength={48}
                autoFocus
              />
            </label>
            <label>
              Username
              <div className="username-input">
                <span>@</span>
                <input
                  value={username}
                  onChange={(event) => setUsername(
                    event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 24)
                  )}
                  minLength={3}
                  maxLength={24}
                />
              </div>
            </label>
            <label>
              Bio <small>{bio.length}/160</small>
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                maxLength={160}
                rows={3}
                placeholder="A little about you"
              />
            </label>
            {status && <p className="form-error" role="status">{status}</p>}
            <div className="profile-form-actions">
              <button className="secondary-button" type="button" onClick={cancelEdit} disabled={busy}>
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={busy}>
                {busy ? "Saving..." : "Save changes"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="profile-details-identity">
              <span className="profile-details-avatar">
                {profile.avatarPath
                  ? <img src={profile.avatarPath} alt="" />
                  : <span>{profile.displayName.slice(0, 1).toUpperCase()}</span>}
              </span>
              <h3>{profile.displayName}</h3>
              <p>online</p>
            </div>

            <div className="profile-info-list">
              {accountContact && (
                <div className="profile-info-row">
                  {contactIsPhone ? <Phone size={20} /> : <Mail size={20} />}
                  <span>
                    <strong>{accountContact}</strong>
                    <small>{contactIsPhone ? "Phone" : "Email"}</small>
                  </span>
                </div>
              )}
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
                  <strong>Profile visibility</strong>
                  <small>People can find you by your username.</small>
                </span>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
