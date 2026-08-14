import {
  Check,
  Clock3,
  MessageCircle,
  Plus,
  Search,
  UserCheck,
  UserMinus,
  UserPlus,
  UserRound,
  Users,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  apiDelete,
  apiGet,
  apiPost,
  apiPut,
  type Connection,
  type Conversation,
  type Profile
} from "../lib/api";
import { ConversationList } from "./ConversationList";

type Props = {
  conversations: Conversation[];
  activeId?: string;
  searchOpen: boolean;
  unreadCounts: Record<string, number>;
  onlineUserIds: Set<string>;
  conversationPreviews: Record<string, string>;
  onSelect: (conversation: Conversation) => void;
  onStartDirect: (profile: Profile) => Promise<void>;
  onViewProfile: (profile: Profile) => void;
  onCreateGroup: (title: string, memberIds: string[]) => Promise<void>;
  fallbackPeople?: Profile[];
};

export function ChatDiscovery({
  conversations,
  activeId,
  searchOpen,
  unreadCounts,
  onlineUserIds,
  conversationPreviews,
  onSelect,
  onStartDirect,
  onViewProfile,
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
  const [connections, setConnections] = useState<Connection[]>([]);
  const [suggestedPeople, setSuggestedPeople] = useState<Profile[]>([]);
  const [connectionBusyId, setConnectionBusyId] = useState<string>();
  const [status, setStatus] = useState("");

  const normalizedQuery = searchOpen ? query.trim().replace(/^@+/, "") : "";

  const visibleConversations = useMemo(() => {
    const needle = normalizedQuery.toLowerCase();
    if (!needle) return conversations;
    return conversations.filter((conversation) => conversation.title.toLowerCase().includes(needle));
  }, [conversations, normalizedQuery]);

  const pinnedConversations = visibleConversations.slice(0, Math.min(2, visibleConversations.length));
  const recentConversations = visibleConversations.slice(pinnedConversations.length);

  useEffect(() => {
    if (!searchOpen) {
      setQuery("");
      setPeople([]);
      setSearching(false);
      setStatus("");
    }
  }, [searchOpen]);

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

  useEffect(() => {
    apiGet<Connection[]>("/api/connections")
      .then(setConnections)
      .catch(() => setConnections(fallbackPeople.map((profile, index) => ({
        id: `demo-connection-${index}`,
        status: "accepted",
        direction: "accepted",
        profile,
        updatedAt: new Date().toISOString()
      }))));
  }, [fallbackPeople]);

  useEffect(() => {
    apiGet<Profile[]>("/api/profiles/suggestions")
      .then(setSuggestedPeople)
      .catch(() => setSuggestedPeople(fallbackPeople));
  }, [fallbackPeople]);

  const incomingRequests = connections.filter((connection) => connection.direction === "incoming");
  const contacts = connections.filter((connection) => connection.status === "accepted");
  const connectableSuggestions = suggestedPeople
    .filter((suggestion) => !connectionFor(suggestion.id))
    .slice(0, 6);

  function connectionFor(profileId: string) {
    return connections.find((connection) => connection.profile.id === profileId);
  }

  async function requestConnection(profile: Profile) {
    setConnectionBusyId(profile.id);
    setStatus("");
    try {
      const saved = await apiPost<Connection>("/api/connections", { profileId: profile.id });
      setConnections((current) => [
        saved,
        ...current.filter((connection) => connection.id !== saved.id)
      ]);
    } catch {
      setStatus(`Could not add @${profile.username} right now.`);
    } finally {
      setConnectionBusyId(undefined);
    }
  }

  async function acceptConnection(connection: Connection) {
    setConnectionBusyId(connection.profile.id);
    setStatus("");
    try {
      const saved = await apiPut<Connection>(`/api/connections/${connection.id}/accept`, {});
      setConnections((current) => current.map((item) => item.id === saved.id ? saved : item));
    } catch {
      setStatus(`Could not accept @${connection.profile.username}.`);
    } finally {
      setConnectionBusyId(undefined);
    }
  }

  async function removeConnection(connection: Connection) {
    setConnectionBusyId(connection.profile.id);
    setStatus("");
    try {
      await apiDelete(`/api/connections/${connection.id}`);
      setConnections((current) => current.filter((item) => item.id !== connection.id));
    } catch {
      setStatus(`Could not update @${connection.profile.username}.`);
    } finally {
      setConnectionBusyId(undefined);
    }
  }

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
    const contactProfiles = contacts.map((connection) => connection.profile);
    setGroupPeople(contactProfiles.length ? contactProfiles : fallbackPeople);
    if (!contactProfiles.length && !fallbackPeople.length) {
      setStatus("Add a contact before creating a group.");
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
      {searchOpen && (
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
            autoFocus
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
      )}

      {searchOpen && (
        <div className="discovery-content search-only">
          {normalizedQuery.length < 2 && (
            <section className="search-empty-state" aria-label="Search">
              <Search size={24} />
              <strong>Search chats and people</strong>
              <small>Type at least 2 characters to find usernames, names, and conversations.</small>
            </section>
          )}

          {normalizedQuery.length >= 2 && (
            <>
              <section className="people-results" aria-label="People">
                <div className="section-label">
                  <span>People</span>
                  {searching && <small>Searching...</small>}
                </div>
                {people.map((profile) => (
                  <div
                    className="person-result"
                    key={profile.id}
                  >
                    <button
                      className="person-main"
                      type="button"
                      onClick={() => onViewProfile(profile)}
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
                    </button>
                    <button
                      className="connection-action"
                      type="button"
                      title={
                        connectionFor(profile.id)?.status === "accepted"
                          ? "Contact"
                          : connectionFor(profile.id)?.direction === "incoming"
                            ? "Accept contact request"
                            : connectionFor(profile.id)?.direction === "outgoing"
                              ? "Request sent"
                              : "Add contact"
                      }
                      disabled={
                        connectionBusyId === profile.id
                        || connectionFor(profile.id)?.direction === "outgoing"
                      }
                      onClick={() => {
                        const connection = connectionFor(profile.id);
                        if (connection?.direction === "incoming") acceptConnection(connection);
                        else if (!connection) requestConnection(profile);
                      }}
                    >
                      {connectionBusyId === profile.id
                        ? <Clock3 size={17} />
                        : connectionFor(profile.id)?.status === "accepted"
                          ? <UserCheck size={17} />
                          : connectionFor(profile.id)?.direction === "outgoing"
                            ? <Clock3 size={17} />
                            : <UserPlus size={17} />}
                    </button>
                    <button
                      className="message-person"
                      type="button"
                      title="Message"
                      onClick={() => startDirect(profile)}
                      disabled={Boolean(openingProfileId)}
                    >
                      {openingProfileId === profile.id
                        ? <Clock3 size={17} />
                        : <MessageCircle size={17} />}
                    </button>
                  </div>
                ))}
                {!searching && people.length === 0 && <p className="empty-note">No people found.</p>}
                {status && !groupOpen && <p className="discovery-status" role="status">{status}</p>}
              </section>

              <section className="chat-results" aria-label="Chats">
                <div className="section-label"><span>Chats</span></div>
                <ConversationList
                  conversations={visibleConversations}
                  activeId={activeId}
                  unreadCounts={unreadCounts}
                  onlineUserIds={onlineUserIds}
                  conversationPreviews={conversationPreviews}
                  onSelect={onSelect}
                />
                {!visibleConversations.length && <p className="empty-note">No matching chats.</p>}
              </section>
            </>
          )}
        </div>
      )}

      {!searchOpen && (
      <div className="discovery-content">
        {normalizedQuery.length >= 2 && (
          <section className="people-results" aria-label="People">
            <div className="section-label">
              <span>People</span>
              {searching && <small>Searching...</small>}
            </div>
            {people.map((profile) => (
              <div
                className="person-result"
                key={profile.id}
              >
                <button
                  className="person-main"
                  type="button"
                  onClick={() => onViewProfile(profile)}
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
                </button>
                <button
                  className="connection-action"
                  type="button"
                  title={
                    connectionFor(profile.id)?.status === "accepted"
                      ? "Contact"
                      : connectionFor(profile.id)?.direction === "incoming"
                        ? "Accept contact request"
                        : connectionFor(profile.id)?.direction === "outgoing"
                          ? "Request sent"
                          : "Add contact"
                  }
                  disabled={
                    connectionBusyId === profile.id
                    || connectionFor(profile.id)?.direction === "outgoing"
                  }
                  onClick={() => {
                    const connection = connectionFor(profile.id);
                    if (connection?.direction === "incoming") acceptConnection(connection);
                    else if (!connection) requestConnection(profile);
                  }}
                >
                  {connectionBusyId === profile.id
                    ? <Clock3 size={17} />
                    : connectionFor(profile.id)?.status === "accepted"
                      ? <UserCheck size={17} />
                      : connectionFor(profile.id)?.direction === "outgoing"
                        ? <Clock3 size={17} />
                        : <UserPlus size={17} />}
                </button>
                <button
                  className="message-person"
                  type="button"
                  title="Message"
                  onClick={() => startDirect(profile)}
                  disabled={Boolean(openingProfileId)}
                >
                  {openingProfileId === profile.id
                    ? <Clock3 size={17} />
                    : <MessageCircle size={17} />}
                </button>
              </div>
            ))}
            {!searching && people.length === 0 && <p className="empty-note">No people found.</p>}
            {status && !groupOpen && <p className="discovery-status" role="status">{status}</p>}
          </section>
        )}

        {!normalizedQuery && incomingRequests.length > 0 && (
          <section className="connection-results" aria-label="Contact requests">
            <div className="section-label"><span>Contact requests</span></div>
            {incomingRequests.map((connection) => (
              <div className="contact-row" key={connection.id}>
                <span className="avatar">
                  {connection.profile.avatarPath
                    ? <img src={connection.profile.avatarPath} alt="" />
                    : <UserRound size={18} />}
                </span>
                <span>
                  <strong>{connection.profile.displayName}</strong>
                  <small>@{connection.profile.username}</small>
                </span>
                <button
                  type="button"
                  title="Accept"
                  onClick={() => acceptConnection(connection)}
                  disabled={connectionBusyId === connection.profile.id}
                >
                  <Check size={17} />
                </button>
                <button
                  type="button"
                  title="Decline"
                  onClick={() => removeConnection(connection)}
                  disabled={connectionBusyId === connection.profile.id}
                >
                  <X size={17} />
                </button>
              </div>
            ))}
          </section>
        )}

        {!normalizedQuery && contacts.length > 0 && (
          <section className="connection-results" aria-label="Contacts">
            <div className="section-label"><span>Contacts</span><small>{contacts.length}</small></div>
            {contacts.map((connection) => (
              <div className="contact-row" key={connection.id}>
                <button
                  className="contact-main"
                  type="button"
                  onClick={() => onViewProfile(connection.profile)}
                >
                  <span className="avatar">
                    {connection.profile.avatarPath
                      ? <img src={connection.profile.avatarPath} alt="" />
                      : <UserRound size={18} />}
                  </span>
                  <span>
                    <strong>{connection.profile.displayName}</strong>
                    <small>@{connection.profile.username}</small>
                  </span>
                </button>
                <button
                  type="button"
                  title="Remove contact"
                  onClick={() => removeConnection(connection)}
                  disabled={connectionBusyId === connection.profile.id}
                >
                  <UserMinus size={17} />
                </button>
                <button type="button" title="Message" onClick={() => startDirect(connection.profile)}>
                  <MessageCircle size={17} />
                </button>
              </div>
            ))}
          </section>
        )}

        {!normalizedQuery && connectableSuggestions.length > 0 && (
          <section className="connection-results suggested-friends" aria-label="Suggested friends">
            <div className="section-label"><span>Suggested friends</span><small>{connectableSuggestions.length}</small></div>
            {connectableSuggestions.map((suggestion) => (
              <div className="contact-row suggested-friend-row" key={suggestion.id}>
                <button
                  className="contact-main"
                  type="button"
                  onClick={() => onViewProfile(suggestion)}
                >
                  <span className="avatar">
                    {suggestion.avatarPath
                      ? <img src={suggestion.avatarPath} alt="" />
                      : <UserRound size={18} />}
                  </span>
                  <span>
                    <strong>{suggestion.displayName}</strong>
                    <small>@{suggestion.username}</small>
                    {suggestion.bio && <small className="person-bio">{suggestion.bio}</small>}
                  </span>
                </button>
                <button
                  type="button"
                  title="Connect"
                  onClick={() => requestConnection(suggestion)}
                  disabled={connectionBusyId === suggestion.id}
                >
                  {connectionBusyId === suggestion.id ? <Clock3 size={17} /> : <UserPlus size={17} />}
                </button>
                <button
                  type="button"
                  title="Message"
                  onClick={() => startDirect(suggestion)}
                  disabled={Boolean(openingProfileId)}
                >
                  {openingProfileId === suggestion.id ? <Clock3 size={17} /> : <MessageCircle size={17} />}
                </button>
              </div>
            ))}
          </section>
        )}

        <section className="chat-results" aria-label="Chats">
          {pinnedConversations.length > 0 && (
            <>
              <div className="section-label"><span>Pinned</span></div>
              <ConversationList
                conversations={pinnedConversations}
                activeId={activeId}
                unreadCounts={unreadCounts}
                onlineUserIds={onlineUserIds}
                conversationPreviews={conversationPreviews}
                onSelect={onSelect}
              />
            </>
          )}
          {recentConversations.length > 0 && (
            <>
              <div className="section-label recent-label"><span>Recent</span></div>
              <ConversationList
                conversations={recentConversations}
                activeId={activeId}
                unreadCounts={unreadCounts}
                onlineUserIds={onlineUserIds}
                conversationPreviews={conversationPreviews}
                onSelect={onSelect}
              />
            </>
          )}
          {!visibleConversations.length && <p className="empty-note">No matching chats.</p>}
        </section>
      </div>
      )}

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
