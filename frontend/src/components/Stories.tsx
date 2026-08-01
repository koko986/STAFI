import {
  Clock3,
  Eye,
  Globe2,
  Plus,
  Send,
  Trash2,
  UserRound,
  Users,
  X
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Story, StoryReaction } from "../lib/api";

type Props = {
  stories: Story[];
  currentUserId: string;
  onCreate: (file: File, caption: string, visibility: Story["visibility"]) => Promise<void>;
  onDelete: (storyId: string) => Promise<void>;
  onViewed: (story: Story) => Promise<Story>;
  onReact: (story: Story, reaction: StoryReaction) => Promise<Story>;
  onRemoveReaction: (story: Story) => Promise<Story>;
  onReply: (story: Story, body: string) => Promise<Story>;
  onViewProfile: (profileId: string) => void;
  openOwnerId?: string;
  onOwnerStoryOpened?: () => void;
};

const reactionOptions: Array<{ value: StoryReaction; label: string }> = [
  { value: "heart", label: "❤️" },
  { value: "fire", label: "🔥" },
  { value: "like", label: "👍" },
  { value: "laugh", label: "😂" },
  { value: "clap", label: "👏" }
];

function timeLeft(expiresAt: string) {
  const milliseconds = Math.max(0, new Date(expiresAt).getTime() - Date.now());
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.max(1, Math.ceil((milliseconds % 3_600_000) / 60_000));
  return hours > 0 ? `${hours}h ${minutes}m left` : `${minutes}m left`;
}

export function Stories({
  stories,
  currentUserId,
  onCreate,
  onDelete,
  onViewed,
  onReact,
  onRemoveReaction,
  onReply,
  onViewProfile,
  openOwnerId,
  onOwnerStoryOpened
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<Story>();
  const [pendingFile, setPendingFile] = useState<File>();
  const [caption, setCaption] = useState("");
  const [visibility, setVisibility] = useState<Story["visibility"]>("contacts");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [reply, setReply] = useState("");
  const [interactionBusy, setInteractionBusy] = useState(false);

  const orderedStories = useMemo(
    () => [...stories].sort((left, right) => {
      const leftOwn = left.ownerId === currentUserId ? 1 : 0;
      const rightOwn = right.ownerId === currentUserId ? 1 : 0;
      return rightOwn - leftOwn || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    }),
    [currentUserId, stories]
  );
  const previewUrl = useMemo(
    () => pendingFile ? URL.createObjectURL(pendingFile) : "",
    [pendingFile]
  );

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!active) return;
    const latest = stories.find((story) => story.id === active.id);
    if (!latest) setActive(undefined);
    else if (latest !== active) setActive(latest);
  }, [active?.id, stories]);

  useEffect(() => {
    if (!openOwnerId) return;
    const story = orderedStories.find((item) => item.ownerId === openOwnerId);
    if (story) openStory(story);
    onOwnerStoryOpened?.();
  }, [openOwnerId, orderedStories, onOwnerStoryOpened]);

  function chooseStory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setPendingFile(file);
    setCaption("");
    setVisibility("contacts");
    setStatus("");
  }

  async function publishStory() {
    if (!pendingFile) return;
    setBusy(true);
    setStatus("");
    try {
      await onCreate(pendingFile, caption.trim(), visibility);
      setPendingFile(undefined);
    } catch {
      setStatus("Could not publish this story. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function openStory(story: Story) {
    setActive(story);
    setReply("");
    setStatus("");
    if (story.ownerId === currentUserId || story.viewed) return;
    try {
      const updated = await onViewed(story);
      setActive(updated);
    } catch {
      // Viewing the signed media can continue even if the receipt is delayed.
    }
  }

  async function toggleReaction(reaction: StoryReaction) {
    if (!active || interactionBusy) return;
    setInteractionBusy(true);
    setStatus("");
    try {
      const updated = active.ownReaction === reaction
        ? await onRemoveReaction(active)
        : await onReact(active, reaction);
      setActive(updated);
    } catch {
      setStatus("Could not update your reaction.");
    } finally {
      setInteractionBusy(false);
    }
  }

  async function sendReply() {
    if (!active || !reply.trim() || interactionBusy) return;
    setInteractionBusy(true);
    setStatus("");
    try {
      const updated = await onReply(active, reply.trim());
      setActive(updated);
      setReply("");
    } catch {
      setStatus("Could not send your private reply.");
    } finally {
      setInteractionBusy(false);
    }
  }

  async function deleteActive() {
    if (!active) return;
    if (!window.confirm("Delete this story? This cannot be undone.")) return;
    setBusy(true);
    setStatus("");
    try {
      await onDelete(active.id);
      setActive(undefined);
    } catch {
      setStatus("Could not delete this story.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="stories" aria-label="Stories">
        <button className="story add-story" onClick={() => inputRef.current?.click()}>
          <span><Plus size={18} /></span>
          <small>Add story</small>
        </button>
        {orderedStories.map((story) => (
          <button
            className={`story ${story.viewed ? "viewed" : ""}`}
            key={story.id}
            onClick={() => openStory(story)}
          >
            <span className="story-thumb" style={{ backgroundImage: `url("${story.mediaPath}")` }}>
              {!story.mediaPath && <UserRound size={18} />}
            </span>
            <small>{story.ownerId === currentUserId ? "My Story" : story.ownerName}</small>
          </button>
        ))}
        <input ref={inputRef} type="file" accept="image/*,video/*" hidden onChange={chooseStory} />
      </div>

      {pendingFile && (
        <div className="modal-backdrop story-composer-backdrop" role="presentation">
          <section className="story-composer" role="dialog" aria-modal="true" aria-labelledby="story-composer-title">
            <header>
              <div>
                <p className="eyebrow">New story</p>
                <h2 id="story-composer-title">Share for 24 hours</h2>
              </div>
              <button className="icon-button" type="button" title="Close" onClick={() => setPendingFile(undefined)}>
                <X size={18} />
              </button>
            </header>
            <div className="story-file-preview">
              {pendingFile.type.startsWith("video/")
                ? <video src={previewUrl} controls />
                : <img src={previewUrl} alt="Story preview" />}
            </div>
            <label>
              Caption
              <input
                value={caption}
                onChange={(event) => setCaption(event.target.value)}
                placeholder="Add a caption"
                maxLength={200}
              />
            </label>
            <fieldset className="story-audience">
              <legend>Who can see this?</legend>
              <button
                className={visibility === "contacts" ? "active" : ""}
                type="button"
                onClick={() => setVisibility("contacts")}
              >
                <Users size={18} />
                <span><strong>My contacts</strong><small>Accepted connections only</small></span>
              </button>
              <button
                className={visibility === "public" ? "active" : ""}
                type="button"
                onClick={() => setVisibility("public")}
              >
                <Globe2 size={18} />
                <span><strong>Public</strong><small>Everyone using Java Chat</small></span>
              </button>
            </fieldset>
            {status && <p className="form-error" role="status">{status}</p>}
            <button className="primary-button" type="button" onClick={publishStory} disabled={busy}>
              {busy ? "Publishing..." : "Publish story"}
            </button>
          </section>
        </div>
      )}

      {active && (
        <div className="story-viewer" role="dialog" aria-modal="true" aria-label={`${active.ownerName}'s story`}>
          <header className="story-viewer-header">
            <button
              className="story-profile-button"
              type="button"
              onClick={() => active.ownerId !== currentUserId && onViewProfile(active.ownerId)}
              disabled={active.ownerId === currentUserId}
            >
              <span className="avatar">
                {active.ownerAvatarPath
                  ? <img src={active.ownerAvatarPath} alt="" />
                  : <UserRound size={18} />}
              </span>
              <span>
                <strong>{active.ownerId === currentUserId ? "My Story" : active.ownerName}</strong>
                <small><Clock3 size={13} /> {timeLeft(active.expiresAt)}</small>
              </span>
            </button>
            {active.ownerId === currentUserId && (
              <button type="button" title="Delete story" onClick={deleteActive} disabled={busy}>
                <Trash2 size={19} />
              </button>
            )}
            <button type="button" title="Close story" onClick={() => setActive(undefined)}>
              <X size={20} />
            </button>
          </header>
          <div className="story-media">
            {active.mediaPath.match(/\.(mp4|webm)(\?|$)/i)
              ? <video src={active.mediaPath} controls autoPlay />
              : <img src={active.mediaPath} alt={active.caption || "Story"} />}
          </div>
          <div className="story-viewer-bottom">
            <footer>
              <span>{active.visibility === "public" ? <Globe2 size={15} /> : <Users size={15} />}</span>
              {active.caption && <p>{active.caption}</p>}
              {active.ownerId === currentUserId && <small><Eye size={15} /> {active.viewCount}</small>}
            </footer>

            <div className="story-reactions" aria-label="Story reactions">
              {reactionOptions.map((reaction) => {
                const count = active.reactions?.[reaction.value] || 0;
                return active.ownerId === currentUserId ? (
                  count > 0 && (
                    <span className="story-reaction-summary" key={reaction.value}>
                      {reaction.label} {count}
                    </span>
                  )
                ) : (
                  <button
                    className={active.ownReaction === reaction.value ? "active" : ""}
                    type="button"
                    title={`React ${reaction.value}`}
                    key={reaction.value}
                    onClick={() => toggleReaction(reaction.value)}
                    disabled={interactionBusy}
                  >
                    <span>{reaction.label}</span>
                    {count > 0 && <small>{count}</small>}
                  </button>
                );
              })}
            </div>

            {active.replies?.length > 0 && (
              <div className="story-replies" aria-label="Private story replies">
                {active.replies.map((item) => (
                  <div key={item.id}>
                    <span className="avatar">
                      {item.senderAvatarPath
                        ? <img src={item.senderAvatarPath} alt="" />
                        : <UserRound size={15} />}
                    </span>
                    <p><strong>{item.senderName}</strong>{item.body}</p>
                  </div>
                ))}
              </div>
            )}

            {active.ownerId !== currentUserId && (
              <form
                className="story-reply-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  sendReply();
                }}
              >
                <input
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Reply privately..."
                  aria-label="Private story reply"
                  maxLength={500}
                />
                <button type="submit" title="Send private reply" disabled={!reply.trim() || interactionBusy}>
                  <Send size={18} />
                </button>
              </form>
            )}
          </div>
          {status && <p className="story-error" role="status">{status}</p>}
        </div>
      )}
    </>
  );
}
