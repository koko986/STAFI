import { Plus, X } from "lucide-react";
import { ChangeEvent, useRef, useState } from "react";
import type { Story } from "../lib/api";

type Props = {
  stories: Story[];
  onCreate: (file: File) => Promise<void>;
};

export function Stories({ stories, onCreate }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState<Story>();
  const [uploading, setUploading] = useState(false);

  async function chooseStory(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onCreate(file);
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  }

  return (
    <>
      <div className="stories" aria-label="Stories">
        <button className="story" onClick={() => inputRef.current?.click()} disabled={uploading}>
          <span><Plus size={18} /></span>
          <small>{uploading ? "Adding..." : "My Story"}</small>
        </button>
        {stories.slice(-3).map((story) => (
          <button className="story" key={story.id} onClick={() => setActive(story)}>
            <span className="story-thumb" style={{ backgroundImage: `url("${story.mediaPath}")` }} />
            <small>{story.caption || "Story"}</small>
          </button>
        ))}
        <input ref={inputRef} type="file" accept="image/*,video/*" hidden onChange={chooseStory} />
      </div>
      {active && (
        <div className="story-viewer" role="dialog" aria-label="Story preview">
          <button className="story-close" onClick={() => setActive(undefined)} title="Close story">
            <X size={20} />
          </button>
          {active.mediaPath.match(/\.(mp4|webm)(\?|$)/i)
            ? <video src={active.mediaPath} controls autoPlay />
            : <img src={active.mediaPath} alt={active.caption || "Story"} />}
          {active.caption && <p>{active.caption}</p>}
        </div>
      )}
    </>
  );
}
