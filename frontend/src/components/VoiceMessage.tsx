import { LoaderCircle, Pause, Play, RotateCcw, SmilePlus } from "lucide-react";
import { ChangeEvent, CSSProperties, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Message } from "../lib/api";

type Props = {
  message: Message;
  compact?: boolean;
  onOpenActions?: (event: MouseEvent<HTMLButtonElement>) => void;
  onRefresh: (messageId: string) => Promise<string>;
};

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
}

export function VoiceMessage({ message, compact = false, onOpenActions, onRefresh }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const refreshAttempts = useRef(0);
  const [source, setSource] = useState(message.mediaPath || "");
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const bars = useMemo(() => {
    const seed = [...message.id].reduce((total, character) => total + character.charCodeAt(0), 0);
    return Array.from({ length: compact ? 20 : 32 }, (_, index) => 7 + ((seed + index * 17) % 18));
  }, [compact, message.id]);

  useEffect(() => {
    setSource(message.mediaPath || "");
    setPlaying(false);
    setFailed(false);
    setCurrentTime(0);
    setDuration(0);
    refreshAttempts.current = 0;
  }, [message.id]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !source) return;
    audio.load();
  }, [source]);

  async function refreshSource() {
    if (loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const refreshed = await onRefresh(message.id);
      if (!refreshed) throw new Error("Voice URL was empty.");
      setSource(refreshed);
      refreshAttempts.current += 1;
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }

  async function recoverOnce() {
    if (refreshAttempts.current > 0 || loading) {
      setFailed(true);
      return;
    }
    await refreshSource();
  }

  async function togglePlayback(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    const audio = audioRef.current;
    if (!audio || loading) return;
    if (failed) {
      refreshAttempts.current = 0;
      await refreshSource();
      return;
    }
    if (audio.paused) {
      try {
        await audio.play();
      } catch {
        await recoverOnce();
      }
    } else {
      audio.pause();
    }
  }

  function seek(event: ChangeEvent<HTMLInputElement>) {
    event.stopPropagation();
    const audio = audioRef.current;
    const nextTime = Number(event.target.value);
    if (!audio || !Number.isFinite(nextTime)) return;
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  }

  const progress = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const progressStyle = { "--voice-progress": `${progress}%` } as CSSProperties;

  return (
    <div className={`voice-message${compact ? " compact" : ""}`} onClick={(event) => event.stopPropagation()}>
      <audio
        ref={audioRef}
        preload="metadata"
        playsInline
        src={source}
        onCanPlay={() => setFailed(false)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration || 0)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
        onError={() => void recoverOnce()}
        onPause={() => setPlaying(false)}
        onPlay={() => setPlaying(true)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
      />
      <button
        className="voice-play"
        type="button"
        title={failed ? "Retry voice message" : playing ? "Pause voice message" : "Play voice message"}
        onClick={togglePlayback}
      >
        {loading
          ? <LoaderCircle className="spin" size={20} />
          : failed
            ? <RotateCcw size={19} />
            : playing
              ? <Pause fill="currentColor" size={19} />
              : <Play fill="currentColor" size={19} />}
      </button>
      <div className="voice-track">
        <div className="voice-waveform" aria-hidden="true">
          {bars.map((height, index) => (
            <span
              className={index / bars.length <= progress / 100 ? "played" : ""}
              key={index}
              style={{ height }}
            />
          ))}
        </div>
        <input
          className="voice-seek"
          type="range"
          min="0"
          max={duration || 0}
          step="0.05"
          value={Math.min(currentTime, duration || 0)}
          aria-label="Voice message position"
          style={progressStyle}
          onChange={seek}
          onClick={(event) => event.stopPropagation()}
        />
        <span className="voice-duration">
          {failed ? "Tap to retry" : formatDuration(playing ? currentTime : duration)}
        </span>
      </div>
      {onOpenActions && (
        <button
          className="voice-actions"
          type="button"
          title="React or reply"
          onClick={onOpenActions}
        >
          <SmilePlus size={17} />
        </button>
      )}
    </div>
  );
}
