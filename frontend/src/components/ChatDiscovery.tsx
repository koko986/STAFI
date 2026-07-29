import { Check, MessageCircle, Plus, Search, UserRound, Users, X } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiGet, type Conversation, type Profile } from "../lib/api";
import { ConversationList } from "./ConversationList";

type Props = {
  conversations: Conversation[];
  activeId?: string;
  onSelect: (conversation: Conversation) => void;
  onStartDirect: (profile: Profile) => Promise<void>;
  onCreateGroup: (title: string, memberIds: string[]) => Promise<void>;
  fallbackPeople?: Profile[];
};

export function ChatDiscovery({
  conversations,
  activeId,
  onSelect,
  onStartDirect,
  onCreateGroup,
  fallbackPeople = []
}: Props) {
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupTitle, setGroupTitle] = useState("");
  const [groupPeople, setGroupPeople] = useState<Profile[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [openingProfileId, setOpeningProfileId] = useState<string>();
  const [status, setStatus] = useState("");

  const normalizedQuery = query.trim().replace(/^@+/, "");

  const visibleConversations = useMemo(() => {
    const needle = normalizedQuery.toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((conversation) => conversation.title.toLowerCase().includes(needle));
  }, [conversations, normalizedQuery]);

  useEffect(() => {
    const needle = normalizedQuery;
    if (needle.length < 2) {
      setPeople([]);
      setSearching(false);
      return;
    }

    let active = true;
    setSearching(true);
    setStatus("");
    const timeout = window.setTimeout(() => {
      apiGet<Profile[]>(`/api/profiles/search?q=${encodeURIComponent(needle)}`)
        .then((matches) => {
          if (active) setPeople(matches);
        })
        .catch(() => {
          if (!active) return;
          setPeople(fallbackPeople.filter((profile) =>
            profile.displayName.toLowerCase().includes(needle.toLowerCase())
            || profile.username.toLowerCase().includes(needle.toLowerCase())
          ));
          if (!fallbackPeople.length) setStatus("Could not search people. Check that the backend is running.");
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [fallbackPeople, normalizedQuery]);

  async function startDirect(profile: Profile) {
    setOpeningProfileId(profile.id);
    setStatus("");
    try {
      await onStartDirect(profile);
      setQuery("");
      setPeople([]);
    } catch {
      setStatus(`Could not open a chat with @${profile.username}. Please try again.`);
    } finally {
      setOpeningProfileId(undefined);
    }
  }

  async function openGroup() {
    setGroupOpen(true);
    setStatus("");
    setSelectedIds([]);
    setGroupTitle("");
    try {
      setGroupPeople(await apiGet<Profile[]>("/api/profiles/search"));
    } catch {
      setGroupPeople(fallbackPeople);
      if (!fallbackPeople.length) setStatus("Could not load people for this group.");
    }
  }

  async function createGroup(event: FormEvent) {
    event.preventDefault();
    if (groupTitle.trim().length < 2) {
      setStatus("Enter a group name.");
      return;
    }
    if (!selectedIds.length) {
      setStatus("Select at least one person.");
      return;
    }
    setBusy(true);
    setStatus("");
    try {
      await onCreateGroup(groupTitle.trim(), selectedIds);
      setGroupOpen(false);
      setQuery("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create the group.");
    } finally {
      setBusy(false);
    }
  }

  function toggleMember(profileId: string) {
    setSelectedIds((current) =>
      current.includes(profileId)
        ? current.filter((id) => id !== profileId)
        : [...current, profileId]
    );
  }

  return (
    <>
      <div className="chat-search">
        <Search size={17} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setStatus("");
          }}
          placeholder="Search name or @username"
          aria-label="Search by name or username"
        />
        {query && (
          <button type="button" title="Clear search" onClick={() => setQuery("")}>
            <X size={16} />
          </button>
        )}
        <button className="new-group-button" type="button" title="New group" onClick={openGroup}>
          <Plus size={18} />
        </button>
      </div>

      <div className="discovery-content">
        {normalizedQuery.length >= 2 && (
          <section className="people-results" aria-label="People">
            <div className="section-label">
              <span>People</span>
              {searching && <small>Searching...</small>}
            </div>
            {people.map((profile) => (
              <button
                className="person-result"
                type="button"
                key={profile.id}
                onClick={() => startDirect(profile)}
                disabled={Boolean(openingProfileId)}
              >
                <span className="avatar">
                  {profile.avatarPath ? <img src={profile.avatarPath} alt="" /> : <UserRound size={18} />}
                </span>
                <span>
                  <strong>{profile.displayName}</strong>
                  <small>@{profile.username}</small>
                  {profile.bio && <small className="person-bio">{profile.bio}</small>}
                </span>
                {openingProfileId === profile.id
                  ? <small className="opening-chat">Opening...</small>
                  : <MessageCircle size={17} />}
              </button>
            ))}
            {!searching && people.length === 0 && <p className="empty-note">No people found.</p>}
            {status && !groupOpen && <p className="discovery-status" role="status">{status}</p>}
          </section>
        )}

        <section className="chat-results" aria-label="Chats">
          <div className="section-label"><span>Chats</span></div>
          <ConversationList
            conversations={visibleConversations}
            activeId={activeId}
            onSelect={onSelect}
          />
          {!visibleConversations.length && <p className="empty-note">No matching chats.</p>}
        </section>
      </div>

      {groupOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="group-modal" role="dialog" aria-modal="true" aria-labelledby="group-title">
            <header>
              <div>
                <p className="eyebrow">New conversation</p>
                <h2 id="group-title">Create a group</h2>
              </div>
              <button className="icon-button" type="button" title="Close" onClick={() => setGroupOpen(false)}>
                <X size={18} />
              </button>
            </header>
            <form onSubmit={createGroup}>
              <label>
                Group name
                <input
                  value={groupTitle}
                  onChange={(event) => setGroupTitle(event.target.value)}
                  placeholder="Project team"
                  maxLength={64}
                  autoFocus
                />
              </label>
              <fieldset>
                <legend>Select members</legend>
                <div className="member-list">
                  {groupPeople.map((profile) => (
                    <label className="member-option" key={profile.id}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(profile.id)}
                        onChange={() => toggleMember(profile.id)}
                      />
                      <span className="avatar">
                        {profile.avatarPath ? <img src={profile.avatarPath} alt="" /> : <UserRound size={18} />}
                      </span>
                      <span>
                        <strong>{profile.displayName}</strong>
                        <small>@{profile.username}</small>
                      </span>
                      {selectedIds.includes(profile.id) && <Check size={17} />}
                    </label>
                  ))}
                </div>
              </fieldset>
              {status && <p className="form-error" role="status">{status}</p>}
              <button className="primary-button" type="submit" disabled={busy}>
                <Users size={18} />
                {busy ? "Creating..." : `Create group${selectedIds.length ? ` (${selectedIds.length + 1})` : ""}`}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
