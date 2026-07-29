import { Camera, LogOut, UserRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiPut, type Profile } from "../lib/api";
import { storeMedia } from "../lib/media";

type Props = {
  initialProfile: Profile;
  onComplete: (profile: Profile) => void;
  onSignOut: () => void;
};

export function ProfileOnboarding({ initialProfile, onComplete, onSignOut }: Props) {
  const [displayName, setDisplayName] = useState(initialProfile.displayName === "New User" ? "" : initialProfile.displayName);
  const [username, setUsername] = useState(initialProfile.username);
  const [bio, setBio] = useState(initialProfile.bio || "");
  const [avatarPath, setAvatarPath] = useState(initialProfile.avatarPath);
  const [avatarFile, setAvatarFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const preview = useMemo(
    () => avatarFile ? URL.createObjectURL(avatarFile) : avatarPath,
    [avatarFile, avatarPath]
  );

  useEffect(() => {
    return () => {
      if (avatarFile && preview) URL.revokeObjectURL(preview);
    };
  }, [avatarFile, preview]);

  async function submit(event: FormEvent) {
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
      let savedAvatar = avatarPath;
      if (avatarFile) {
        const extension = avatarFile.name.split(".").pop() || "jpg";
        savedAvatar = await storeMedia("avatars", avatarFile, extension);
        setAvatarPath(savedAvatar);
      }

      const saved = await apiPut<Profile>("/api/me/profile", {
        ...initialProfile,
        displayName: displayName.trim(),
        username,
        bio: bio.trim(),
        avatarPath: savedAvatar,
        onboarded: true
      });
      onComplete(saved);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save your profile.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="profile-shell">
      <section className="profile-panel">
        <header className="profile-heading">
          <div>
            <p className="eyebrow">One last step</p>
            <h1>Create your profile</h1>
            <p>Choose how people will find and recognize you.</p>
          </div>
          <button className="icon-button" type="button" title="Sign out" onClick={onSignOut}>
            <LogOut size={18} />
          </button>
        </header>

        <form className="profile-form" onSubmit={submit}>
          <label className="avatar-picker">
            <span className="profile-avatar">
              {preview ? <img src={preview} alt="" /> : <UserRound size={34} />}
            </span>
            <span className="avatar-action"><Camera size={16} /> Add photo</span>
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
              placeholder="Your name"
              maxLength={48}
              autoComplete="name"
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
                placeholder="username"
                minLength={3}
                maxLength={24}
                autoComplete="username"
              />
            </div>
          </label>

          <label>
            Bio <small>{bio.length}/160</small>
            <textarea
              value={bio}
              onChange={(event) => setBio(event.target.value)}
              placeholder="A little about you"
              maxLength={160}
              rows={3}
            />
          </label>

          {status && <p className="form-error" role="status">{status}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? "Saving..." : "Continue to chats"}
          </button>
        </form>
      </section>
    </main>
  );
}
