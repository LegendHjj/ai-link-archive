import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  BookmarkPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Database,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Filter,
  GitBranch,
  Grid2X2,
  Globe2,
  Import,
  Layers3,
  Link2,
  ListFilter,
  LogIn,
  LogOut,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Star,
  Trash2,
  SquarePlay,
  Upload,
  X,
} from "lucide-react";

import { useLinks } from "./hooks/useLinks";
import {
  cleanTagInput,
  parseBulkLinks,
  type SourceType,
} from "./lib/bookmarkUtils";
import {
  firebaseEnabled,
  signInWithEmail,
  signInWithGoogle,
  signOutOfFirebase,
} from "./lib/firebase";
import { parseExportedLinksJson } from "./lib/importExport";
import type { AppSettings, Category, ItemType, LinkDraft, LinkItem, LinkStatus, UserProfile } from "./types";

const statusLabels: Record<LinkStatus, string> = {
  unread: "Unread",
  read: "Read",
  archived: "Archived",
};

type ViewMode = "list" | "grid" | "compact";

const categoryTones = ["blue", "violet", "green", "cyan", "amber", "red", "pink", "teal", "slate"];

function toneForCategory(category: Category) {
  let hash = 0;
  for (const char of category) hash += char.charCodeAt(0);
  return categoryTones[hash % categoryTones.length];
}

function formatRelative(timestamp: number) {
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function formatFullDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function SourceIcon({ source }: { source: SourceType }) {
  if (source === "Note") return <FileText size={18} />;
  if (source === "GitHub") return <GitBranch size={18} />;
  if (source === "YouTube") return <SquarePlay size={18} />;
  if (source === "X") return <span className="source-x">X</span>;
  if (source === "Paper" || source === "Docs") return <Database size={18} />;
  return <Globe2 size={18} />;
}

function Sidebar({
  links,
  settings,
  activeCategory,
  activeTag,
  onCategory,
  onTag,
  onShowAdd,
  onShowImport,
  onShowSettings,
}: {
  links: LinkItem[];
  settings: AppSettings;
  activeCategory: Category | "All Links" | "Archived";
  activeTag: string | null;
  onCategory: (category: Category | "All Links" | "Archived") => void;
  onTag: (tag: string | null) => void;
  onShowAdd: () => void;
  onShowImport: () => void;
  onShowSettings: () => void;
}) {
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    links.forEach((link) => {
      link.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1));
    });
    settings.tags.forEach((tag) => counts.set(tag, counts.get(tag) ?? 0));
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [links, settings.tags]);

  const visibleCount = links.filter((link) => link.status !== "archived").length;
  const archivedCount = links.filter((link) => link.status === "archived").length;

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">AI</div>
        <div>
          <strong>AI Link Archive</strong>
          <span>Your AI bookmark hub</span>
        </div>
      </div>

      <button className="primary-action" onClick={onShowAdd}>
        <Plus size={18} />
        Add Item
      </button>
      <button className="secondary-action" onClick={onShowImport}>
        <Import size={17} />
        Paste Multiple Links
      </button>

      <div className="sidebar-scroll">
        <nav className="nav-group">
          <p>Categories</p>
          <button
            className={activeCategory === "All Links" && !activeTag ? "active" : ""}
            onClick={() => {
              onCategory("All Links");
              onTag(null);
            }}
          >
            <Layers3 size={16} />
            <span>All Links</span>
            <b>{visibleCount}</b>
          </button>
          {settings.categories.map((category) => (
            <button
              key={category}
              className={activeCategory === category && !activeTag ? "active" : ""}
              onClick={() => {
                onCategory(category);
                onTag(null);
              }}
            >
              <span className={`dot ${toneForCategory(category)}`} />
              <span>{category}</span>
              <b>{links.filter((link) => link.category === category).length}</b>
            </button>
          ))}
          <button
            className={activeCategory === "Archived" && !activeTag ? "active" : ""}
            onClick={() => {
              onCategory("Archived");
              onTag(null);
            }}
          >
            <Archive size={16} />
            <span>Archived</span>
            <b>{archivedCount}</b>
          </button>
        </nav>

        <nav className="nav-group tags-nav">
          <p>Tags</p>
          {tagCounts.map(([tag, count]) => (
            <button
              key={tag}
              className={activeTag === tag ? "active" : ""}
              onClick={() => {
                onCategory("All Links");
                onTag(activeTag === tag ? null : tag);
              }}
            >
              <ChevronDown size={14} />
              <span>{tag}</span>
              <b>{count}</b>
            </button>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <button onClick={onShowSettings}>
          <Settings size={17} />
          <span>Settings</span>
          <ChevronDown size={16} />
        </button>
      </div>
    </aside>
  );
}

function LinkTable({
  links,
  selectedIds,
  activeId,
  compact = false,
  onSelect,
  onToggleSelect,
  onSelectAll,
}: {
  links: LinkItem[];
  selectedIds: string[];
  activeId: string | null;
  compact?: boolean;
  onSelect: (link: LinkItem) => void;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
}) {
  const selectedSet = new Set(selectedIds);
  return (
    <section className="table-shell">
      <div className="table-head">
        <label className="check-cell">
          <input
            type="checkbox"
            checked={links.length > 0 && selectedIds.length === links.length}
            onChange={onSelectAll}
          />
        </label>
        <span>Title</span>
        <span>Category</span>
        <span>Tags</span>
        <span>Open</span>
        <span>Saved</span>
      </div>
      <div className="rows">
        {links.map((link) => (
          <div
            key={link.id}
            className={`link-row ${compact ? "compact" : ""} ${activeId === link.id ? "focused" : ""}`}
            onClick={() => onSelect(link)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") onSelect(link);
            }}
          >
            <label className="check-cell" onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedSet.has(link.id)}
                onChange={() => onToggleSelect(link.id)}
              />
            </label>
            <span className="title-cell">
              <span className={`read-dot ${link.status}`} />
              <span>
                <strong>{link.title}</strong>
                <small>{link.notes || link.domain}</small>
              </span>
            </span>
            <span>
              <em className={`category-pill ${toneForCategory(link.category)}`}>
                {link.category}
              </em>
            </span>
            <span className="tag-cell">
              {link.tags.slice(0, 2).map((tag) => (
                <i key={tag}>{tag}</i>
              ))}
              {link.tags.length > 2 ? <i>+{link.tags.length - 2}</i> : null}
            </span>
            <span className="source-cell">
              {link.url ? (
                <a
                  className="row-open-link"
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(event) => event.stopPropagation()}
                >
                  <ExternalLink size={16} />
                  Open
                </a>
              ) : (
                <>
                  <SourceIcon source={link.source} />
                  Note
                </>
              )}
            </span>
            <span className="saved-cell">
              {link.favorite ? <Star size={16} fill="#f6bd2f" stroke="#f6bd2f" /> : null}
              {formatRelative(link.createdAt)}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function LinkGrid({
  links,
  selectedIds,
  activeId,
  onSelect,
  onToggleSelect,
}: {
  links: LinkItem[];
  selectedIds: string[];
  activeId: string | null;
  onSelect: (link: LinkItem) => void;
  onToggleSelect: (id: string) => void;
}) {
  const selectedSet = new Set(selectedIds);

  return (
    <section className="grid-shell">
      {links.map((link) => (
        <article
          key={link.id}
          className={`link-card-tile ${activeId === link.id ? "focused" : ""}`}
          onClick={() => onSelect(link)}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") onSelect(link);
          }}
        >
          <div className="tile-topline">
            <label className="check-cell" onClick={(event) => event.stopPropagation()}>
              <input
                type="checkbox"
                checked={selectedSet.has(link.id)}
                onChange={() => onToggleSelect(link.id)}
              />
            </label>
            <span className={`read-dot ${link.status}`} />
            <em className={`category-pill ${toneForCategory(link.category)}`}>
              {link.category}
            </em>
          </div>
          <h3>{link.title}</h3>
          <p>{link.notes || link.domain}</p>
          <div className="tile-tags">
            {link.tags.slice(0, 4).map((tag) => (
              <i key={tag}>{tag}</i>
            ))}
          </div>
          <div className="tile-footer">
            <span>
              <SourceIcon source={link.source} />
              {formatRelative(link.createdAt)}
            </span>
            {link.url ? (
              <a
                className="row-open-link"
                href={link.url}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => event.stopPropagation()}
              >
                <ExternalLink size={16} />
                Open
              </a>
            ) : (
              <span>Note</span>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}

function DetailPanel({
  link,
  categories,
  pinned,
  onUpdate,
  onDelete,
  onClear,
  onTogglePin,
}: {
  link: LinkItem | null;
  categories: Category[];
  pinned: boolean;
  onUpdate: (id: string, patch: Partial<LinkItem>) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onTogglePin: () => void;
}) {
  const [tagInput, setTagInput] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleDraft(link?.title ?? "");
    setNotesDraft(link?.notes ?? "");
    setTagInput("");
  }, [link?.id, link?.title, link?.notes]);

  if (!link) {
    return (
      <aside className="detail-panel empty-detail">
        <BookmarkPlus size={32} />
        <h2>Select an item</h2>
        <p>Open a saved resource or note to edit notes, tags, category, and status.</p>
      </aside>
    );
  }

  function addTags() {
    if (!link) return;
    const merged = [...new Set([...link.tags, ...cleanTagInput(tagInput)])];
    onUpdate(link.id, { tags: merged });
    setTagInput("");
  }

  function commitTextPatch(patch: Pick<Partial<LinkItem>, "title" | "notes">) {
    if (!link) return;
    const nextPatch: Pick<Partial<LinkItem>, "title" | "notes"> = {};
    if (patch.title !== undefined && patch.title !== link.title) {
      nextPatch.title = patch.title;
    }
    if (patch.notes !== undefined && patch.notes !== link.notes) {
      nextPatch.notes = patch.notes;
    }
    if (Object.keys(nextPatch).length) onUpdate(link.id, nextPatch);
  }

  return (
    <aside className="detail-panel">
      <div className="panel-tools">
        <button
          className={`icon-button ${pinned ? "active" : ""}`}
          title={pinned ? "Unpin detail" : "Pin detail"}
          onClick={onTogglePin}
        >
          <Pin size={17} />
        </button>
        <button
          className="icon-button"
          title="Edit title"
          onClick={() => titleRef.current?.focus()}
        >
          <Edit3 size={17} />
        </button>
        <button className="icon-button" title="Close detail" onClick={onClear}>
          <X size={18} />
        </button>
      </div>

      <div className="detail-header">
        <span className="source-badge" title={link.source}>
          <MoreHorizontal size={18} />
        </span>
        <h2>{titleDraft || link.title}</h2>
        <div className="detail-actions">
          <button
            className="icon-button"
            title="Favorite"
            onClick={() => onUpdate(link.id, { favorite: !link.favorite })}
          >
            <Star
              size={19}
              fill={link.favorite ? "#f6bd2f" : "none"}
              stroke={link.favorite ? "#f6bd2f" : "currentColor"}
            />
          </button>
          {link.url ? (
            <a className="icon-button" title="Open link" href={link.url} target="_blank" rel="noreferrer">
              <ExternalLink size={18} />
            </a>
          ) : null}
        </div>
      </div>

      <em className={`category-pill ${toneForCategory(link.category)}`}>
        {link.category}
      </em>

      {link.url ? (
        <div className="url-box">
          <a href={link.url} target="_blank" rel="noreferrer">
            {link.url}
          </a>
          <button
            className="icon-button"
            title="Copy link"
            onClick={() => navigator.clipboard.writeText(link.url)}
          >
            <Copy size={17} />
          </button>
        </div>
      ) : null}

      <section className="detail-section">
        <label>Title</label>
        <input
          ref={titleRef}
          value={titleDraft}
          onChange={(event) => setTitleDraft(event.target.value)}
          onBlur={() => commitTextPatch({ title: titleDraft })}
        />
      </section>

      <section className="detail-section">
        <label>Tags</label>
        <div className="detail-tags">
          {link.tags.map((tag) => (
            <button
              key={tag}
              onClick={() =>
                onUpdate(link.id, { tags: link.tags.filter((item) => item !== tag) })
              }
            >
              {tag}
            </button>
          ))}
        </div>
        <div className="inline-form">
          <input
            value={tagInput}
            onChange={(event) => setTagInput(event.target.value)}
            placeholder="Add tags"
          />
          <button onClick={addTags}>Add</button>
        </div>
      </section>

      <section className="detail-grid">
        <label>
          Category
          <select
            value={link.category}
            onChange={(event) =>
              onUpdate(link.id, { category: event.target.value as Category })
            }
          >
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            value={link.status}
            onChange={(event) =>
              onUpdate(link.id, { status: event.target.value as LinkStatus })
            }
          >
            <option value="unread">Unread</option>
            <option value="read">Read</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </section>

      <section className="detail-section">
        <label>Notes</label>
        <textarea
          value={notesDraft}
          onChange={(event) => setNotesDraft(event.target.value)}
          onBlur={() => commitTextPatch({ notes: notesDraft })}
          placeholder="Why did you save this?"
        />
      </section>

      <section className="detail-meta">
        <div>
          <span>Source</span>
          <strong>
            <SourceIcon source={link.source} />
            {link.url ? link.domain : "Note"}
          </strong>
        </div>
        <div>
          <span>Saved</span>
          <strong>{formatFullDate(link.createdAt)}</strong>
        </div>
        <div>
          <span>Updated</span>
          <strong>{formatFullDate(link.updatedAt)}</strong>
        </div>
      </section>

      <div className="panel-action-list">
        {link.url ? (
          <a href={link.url} target="_blank" rel="noreferrer">
            <ExternalLink size={17} />
            Open Link
          </a>
        ) : null}
        <button onClick={() => onUpdate(link.id, { status: "read" })}>
          <CheckCircle2 size={17} />
          Mark as Read
        </button>
        <button onClick={() => onUpdate(link.id, { status: "archived" })}>
          <Archive size={17} />
          Archive
        </button>
        <button className="danger" onClick={() => onDelete(link.id)}>
          <Trash2 size={17} />
          Delete Item
        </button>
      </div>
    </aside>
  );
}

function AddLinkModal({
  categories,
  defaultCategory,
  onClose,
  onAdd,
}: {
  categories: Category[];
  defaultCategory?: Category;
  onClose: () => void;
  onAdd: (draft: LinkDraft) => void;
}) {
  const [type, setType] = useState<ItemType>("link");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState(defaultCategory ?? categories[0] ?? "");
  const [tags, setTags] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setCategory(defaultCategory ?? categories[0] ?? "");
  }, [categories, defaultCategory]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (type === "link" && !url.trim()) return;
    if (type === "note" && !title.trim() && !notes.trim()) return;
    onAdd({
      type,
      url: type === "link" ? url.trim() : "",
      title: title.trim(),
      category,
      tags: cleanTagInput(tags),
      notes,
    });
  }

  return (
    <div className="modal-backdrop">
      <form className="modal" onSubmit={submit}>
        <h2>Add Item</h2>
        <div className="segmented-control">
          <button
            type="button"
            className={type === "link" ? "active" : ""}
            onClick={() => setType("link")}
          >
            <ExternalLink size={16} />
            Link
          </button>
          <button
            type="button"
            className={type === "note" ? "active" : ""}
            onClick={() => setType("note")}
          >
            <FileText size={16} />
            Note
          </button>
        </div>
        {type === "link" ? (
          <label>
            URL
            <input value={url} onChange={(event) => setUrl(event.target.value)} autoFocus />
          </label>
        ) : null}
        <label>
          Title
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            autoFocus={type === "note"}
          />
        </label>
        <label>
          Category
          {categories.length ? (
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {categories.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          ) : (
            <input
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="Category"
            />
          )}
        </label>
        <label>
          Tags
          <input
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="llm, agents, research"
          />
        </label>
        <label>
          Notes
          <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Save Item</button>
        </div>
      </form>
    </div>
  );
}

function ProfileSwitcher({
  profiles,
  activeProfileId,
  onSwitch,
  onNew,
}: {
  profiles: UserProfile[];
  activeProfileId: string;
  onSwitch: (profileId: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="profile-switcher">
      <select
        value={activeProfileId}
        onChange={(event) => onSwitch(event.target.value)}
        title="Switch profile"
      >
        {profiles.map((profile) => (
          <option key={profile.id} value={profile.id}>
            {profile.name}
          </option>
        ))}
      </select>
      <button className="icon-button" onClick={onNew} title="New profile">
        <Plus size={17} />
      </button>
    </div>
  );
}

function NewProfileModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
  }

  return (
    <div className="modal-backdrop">
      <form className="modal small-modal" onSubmit={submit}>
        <h2>New Profile</h2>
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="English"
            autoFocus
          />
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Create Profile</button>
        </div>
      </form>
    </div>
  );
}

function ImportModal({
  onClose,
  onImport,
}: {
  onClose: () => void;
  onImport: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const parsedLinks = parseBulkLinks(text);
  const parsedJsonLinks = parseExportedLinksJson(text);
  const detectedCount = parsedJsonLinks.length || parsedLinks.length;

  function submit(event: FormEvent) {
    event.preventDefault();
    onImport(text);
  }

  async function readFile(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
  }

  return (
    <div className="modal-backdrop">
      <form className="modal import-modal" onSubmit={submit}>
        <h2>Import Links</h2>
        <label>
          JSON file
          <input
            type="file"
            accept="application/json,.json"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
        </label>
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Paste exported JSON, URLs from Chrome bookmarks, notes, or chat."
          autoFocus
        />
        <p>
          {parsedJsonLinks.length
            ? `${parsedJsonLinks.length} exported items detected`
            : `${parsedLinks.length} unique links detected`}
        </p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!detectedCount}>
            Import
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsModal({
  settings,
  links,
  onClose,
  onAddCategory,
  onDeleteCategory,
  onReorderCategory,
  onAddTag,
  onDeleteTag,
}: {
  settings: AppSettings;
  links: LinkItem[];
  onClose: () => void;
  onAddCategory: (category: string) => void;
  onDeleteCategory: (category: string) => void;
  onReorderCategory: (category: string, direction: "up" | "down") => void;
  onAddTag: (tag: string) => void;
  onDeleteTag: (tag: string) => void;
}) {
  const [categoryInput, setCategoryInput] = useState("");
  const [tagInput, setTagInput] = useState("");
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    links.forEach((link) => link.tags.forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    settings.tags.forEach((tag) => counts.set(tag, counts.get(tag) ?? 0));
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [links, settings.tags]);

  function addCategory(event: FormEvent) {
    event.preventDefault();
    if (!categoryInput.trim()) return;
    onAddCategory(categoryInput);
    setCategoryInput("");
  }

  function addTag(event: FormEvent) {
    event.preventDefault();
    const [tag] = cleanTagInput(tagInput);
    if (!tag) return;
    onAddTag(tag);
    setTagInput("");
  }

  return (
    <div className="modal-backdrop">
      <section className="modal settings-modal">
        <div className="modal-title-row">
          <h2>Settings</h2>
          <button className="icon-button" onClick={onClose} title="Close settings">
            <X size={18} />
          </button>
        </div>

        <section className="settings-section">
          <h3>Categories</h3>
          <form className="inline-form" onSubmit={addCategory}>
            <input
              value={categoryInput}
              onChange={(event) => setCategoryInput(event.target.value)}
              placeholder="New category"
            />
            <button>Add</button>
          </form>
          <div className="management-list">
            {settings.categories.map((category, index) => (
              <div key={category}>
                <span>
                  <i className={`dot ${toneForCategory(category)}`} />
                  {category}
                </span>
                <b>{links.filter((link) => link.category === category).length}</b>
                <div className="management-row-actions">
                  <button
                    className="icon-button"
                    onClick={() => onReorderCategory(category, "up")}
                    title={`Move ${category} up`}
                    disabled={index === 0}
                  >
                    <ChevronUp size={16} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => onReorderCategory(category, "down")}
                    title={`Move ${category} down`}
                    disabled={index === settings.categories.length - 1}
                  >
                    <ChevronDown size={16} />
                  </button>
                  <button
                    className="icon-button"
                    onClick={() => onDeleteCategory(category)}
                    title={`Delete ${category}`}
                    disabled={settings.categories.length <= 1}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <h3>Tags</h3>
          <form className="inline-form" onSubmit={addTag}>
            <input
              value={tagInput}
              onChange={(event) => setTagInput(event.target.value)}
              placeholder="New tag"
            />
            <button>Add</button>
          </form>
          <div className="management-list tag-management-list">
            {tagCounts.map(([tag, count]) => (
              <div key={tag}>
                <span>{tag}</span>
                <b>{count}</b>
                <button
                  className="icon-button"
                  onClick={() => onDeleteTag(tag)}
                  title={`Delete ${tag}`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function LoginScreen({ mode, syncError }: { mode: string; syncError: string | null }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail(email.trim(), password);
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (signInError) {
      setError(signInError instanceof Error ? signInError.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="brand">
          <div className="brand-mark">AI</div>
          <div>
            <strong>AI Link Archive</strong>
            <span>{mode}</span>
          </div>
        </div>
        <label>
          Email
          <input value={email} onChange={(event) => setEmail(event.target.value)} autoFocus />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        {error || syncError ? <div className="error-banner">{error || syncError}</div> : null}
        <button className="primary-action" disabled={busy || !email.trim() || !password}>
          <LogIn size={17} />
          Sign in
        </button>
        <button className="secondary-action" type="button" disabled={busy} onClick={google}>
          <Globe2 size={17} />
          Google
        </button>
      </form>
    </main>
  );
}

export default function App() {
  const {
    links,
    settings,
    loading,
    authReady,
    mode,
    syncError,
    user,
    profiles,
    activeProfileId,
    addLink,
    addMany,
    importLinks,
    updateLink,
    removeLinks,
    bulkStatus,
    addCategory,
    deleteCategory,
    reorderCategory,
    addTag,
    deleteTag,
    switchProfile,
    addProfile,
  } = useLinks();
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<
    Category | "All Links" | "Archived"
  >("All Links");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<LinkStatus | "all">("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [detailOpen, setDetailOpen] = useState(true);
  const [detailPinned, setDetailPinned] = useState(true);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const filteredLinks = useMemo(() => {
    const lowerQuery = query.toLowerCase().trim();
    return links
      .filter((link) => {
        if (activeCategory === "Archived") return link.status === "archived";
        if (link.status === "archived") return false;
        if (activeCategory !== "All Links" && link.category !== activeCategory) {
          return false;
        }
        if (activeTag && !link.tags.includes(activeTag)) return false;
        if (statusFilter !== "all" && link.status !== statusFilter) return false;
        if (!lowerQuery) return true;
        return [link.title, link.url, link.domain, link.notes, ...link.tags]
          .join(" ")
          .toLowerCase()
          .includes(lowerQuery);
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [activeCategory, activeTag, links, query, statusFilter]);

  const activeLink = detailOpen
    ? (activeId ? links.find((link) => link.id === activeId) ?? null : null) ??
      (detailPinned ? filteredLinks[0] ?? null : null)
    : null;
  const defaultAddCategory =
    activeCategory !== "All Links" && activeCategory !== "Archived"
      ? activeCategory
      : undefined;
  const selectedCount = selectedIds.length;

  async function handleAdd(draft: LinkDraft) {
    const link = await addLink(draft);
    setActiveId(link.id);
    setDetailOpen(true);
    setShowAdd(false);
  }

  async function handleImport(text: string) {
    const jsonLinks = parseExportedLinksJson(text);
    if (jsonLinks.length) {
      await importLinks(jsonLinks);
    } else {
      await addMany(parseBulkLinks(text));
    }
    setShowImport(false);
  }

  function handleSwitchProfile(profileId: string) {
    switchProfile(profileId);
    setActiveCategory("All Links");
    setActiveTag(null);
    setStatusFilter("all");
    setSelectedIds([]);
    setActiveId(null);
    setDetailOpen(true);
  }

  async function handleCreateProfile(name: string) {
    await addProfile(name);
    setShowProfile(false);
    setActiveCategory("All Links");
    setActiveTag(null);
    setStatusFilter("all");
    setSelectedIds([]);
    setActiveId(null);
    setDetailOpen(true);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(links, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `ai-link-archive-${new Date().toISOString()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (firebaseEnabled && !authReady) {
    return <LoginScreen mode={mode} syncError={syncError} />;
  }

  if (firebaseEnabled && authReady && !user) {
    return <LoginScreen mode={mode} syncError={syncError} />;
  }

  return (
    <div className={`app-shell ${detailOpen ? "" : "detail-closed"}`}>
      <Sidebar
        links={links}
        settings={settings}
        activeCategory={activeCategory}
        activeTag={activeTag}
        onCategory={(category) => {
          setActiveCategory(category);
          setSelectedIds([]);
        }}
        onTag={setActiveTag}
        onShowAdd={() => setShowAdd(true)}
        onShowImport={() => setShowImport(true)}
        onShowSettings={() => setShowSettings(true)}
      />

      <main className="main">
        <header className="topbar">
          <div className="search-box">
            <Search size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search titles, notes, tags, or URLs..."
            />
            <kbd>Ctrl K</kbd>
          </div>
          <div className="toolbar-cluster">
            <button className="toolbar-button" onClick={() => setStatusFilter("all")}>
              <Filter size={17} />
              Filter
            </button>
            <select
              className="status-select"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as LinkStatus | "all")}
            >
              <option value="all">All status</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>
          <button className="toolbar-button" onClick={() => setShowImport(true)}>
            <Upload size={17} />
            Import
          </button>
          <button className="toolbar-button" onClick={exportJson}>
            <Download size={17} />
            Export
          </button>
          <ProfileSwitcher
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSwitch={handleSwitchProfile}
            onNew={() => setShowProfile(true)}
          />
          <span className="sync-chip">
            <Database size={15} />
            {mode}
          </span>
          {firebaseEnabled ? (
            user ? (
              <button className="avatar-button" onClick={signOutOfFirebase}>
                <LogOut size={16} />
                {user.displayName?.slice(0, 1) ?? "U"}
              </button>
            ) : (
              <button className="toolbar-button" onClick={signInWithGoogle}>
                <LogIn size={17} />
                Sign in
              </button>
            )
          ) : (
            <span className="avatar">A</span>
          )}
        </header>

        <section className="bulkbar">
          <label className="check-cell all-check">
            <input
              type="checkbox"
              checked={filteredLinks.length > 0 && selectedIds.length === filteredLinks.length}
              onChange={() =>
                setSelectedIds((current) =>
                  current.length === filteredLinks.length
                    ? []
                    : filteredLinks.map((link) => link.id),
                )
              }
            />
          </label>
          <strong>{selectedCount} selected</strong>
          <button
            disabled={!selectedCount}
            onClick={() =>
              selectedIds.forEach((id) => {
                const link = links.find((item) => item.id === id);
                if (link) updateLink(id, { favorite: !link.favorite });
              })
            }
          >
            <Star size={17} />
            Favorite
          </button>
          <button disabled={!selectedCount} onClick={() => bulkStatus(selectedIds, "read")}>
            <CheckCircle2 size={17} />
            Mark as Read
          </button>
          <button disabled={!selectedCount} onClick={() => bulkStatus(selectedIds, "archived")}>
            <Archive size={17} />
            Archive
          </button>
          <button disabled={!selectedCount} onClick={() => removeLinks(selectedIds)}>
            <Trash2 size={17} />
            Delete
          </button>
          <button onClick={() => setShowAdd(true)}>
            <Plus size={17} />
            Add Item
          </button>
          <button onClick={() => setShowImport(true)}>
            <Import size={17} />
            Bulk Paste
          </button>
          <div className="view-actions">
            <button
              className={viewMode === "list" ? "active" : ""}
              title="List view"
              onClick={() => setViewMode("list")}
            >
              <ListFilter size={17} />
            </button>
            <button
              className={viewMode === "grid" ? "active" : ""}
              title="Grid view"
              onClick={() => setViewMode("grid")}
            >
              <Grid2X2 size={17} />
            </button>
            <button
              className={viewMode === "compact" ? "active" : ""}
              title="Compact view"
              onClick={() => setViewMode("compact")}
            >
              <SlidersHorizontal size={17} />
            </button>
          </div>
        </section>

        {syncError ? <div className="error-banner">{syncError}</div> : null}

        {loading ? (
          <div className="empty-state">Loading links...</div>
        ) : filteredLinks.length && viewMode === "grid" ? (
          <LinkGrid
            links={filteredLinks}
            selectedIds={selectedIds}
            activeId={activeLink?.id ?? null}
            onSelect={(link) => {
              setActiveId(link.id);
              setDetailOpen(true);
              setMobileSheetOpen(true);
            }}
            onToggleSelect={(id) =>
              setSelectedIds((current) =>
                current.includes(id)
                  ? current.filter((item) => item !== id)
                  : [...current, id],
              )
            }
          />
        ) : filteredLinks.length ? (
          <LinkTable
            links={filteredLinks}
            selectedIds={selectedIds}
            activeId={activeLink?.id ?? null}
            compact={viewMode === "compact"}
            onSelect={(link) => {
              setActiveId(link.id);
              setDetailOpen(true);
              setMobileSheetOpen(true);
            }}
            onToggleSelect={(id) =>
              setSelectedIds((current) =>
                current.includes(id)
                  ? current.filter((item) => item !== id)
                  : [...current, id],
              )
            }
            onSelectAll={() =>
              setSelectedIds((current) =>
                current.length === filteredLinks.length
                  ? []
                  : filteredLinks.map((link) => link.id),
              )
            }
          />
        ) : (
          <div className="empty-state">
            <Link2 size={32} />
            <h2>No links match this view</h2>
            <p>Add a URL, paste a batch, or loosen the filters.</p>
            <button onClick={() => setShowAdd(true)}>Add Link</button>
          </div>
        )}

        <footer className="table-footer">
          <span>
            {filteredLinks.length ? `1-${filteredLinks.length}` : "0"} of {links.length}
          </span>
          <span>{statusFilter === "all" ? "All status" : statusLabels[statusFilter]}</span>
        </footer>
      </main>

      {detailOpen ? (
        <DetailPanel
          link={activeLink}
          categories={
            activeLink
              ? [...new Set([activeLink.category, ...settings.categories])]
              : settings.categories
          }
          pinned={detailPinned}
          onUpdate={updateLink}
          onDelete={(id) => removeLinks([id])}
          onClear={() => {
            setActiveId(null);
            setDetailOpen(false);
            setMobileSheetOpen(false);
          }}
          onTogglePin={() => setDetailPinned((current) => !current)}
        />
      ) : null}

      {/* Mobile bottom sheet — shown when a row is tapped on narrow screens */}
      {mobileSheetOpen && activeLink ? (
        <div
          className="mobile-sheet-backdrop"
          onClick={() => setMobileSheetOpen(false)}
          aria-label="Close detail"
        >
          <div
            className="mobile-sheet"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mobile-sheet-handle" />
            <div className="mobile-sheet-header">
              <span className={`read-dot ${activeLink.status}`} />
              <strong className="mobile-sheet-title">{activeLink.title}</strong>
              <button
                className="icon-button"
                onClick={() => setMobileSheetOpen(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            {activeLink.url ? (
              <a
                className="mobile-sheet-open-btn"
                href={activeLink.url}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={18} />
                Open Link
              </a>
            ) : null}
            {activeLink.url ? (
              <div className="mobile-sheet-url">
                <Globe2 size={14} />
                <span>{activeLink.domain || activeLink.url}</span>
              </div>
            ) : null}
            <div className="mobile-sheet-meta">
              <em className={`category-pill ${toneForCategory(activeLink.category)}`}>
                {activeLink.category}
              </em>
              {activeLink.tags.slice(0, 5).map((tag) => (
                <i key={tag} className="mobile-sheet-tag">{tag}</i>
              ))}
            </div>
            {activeLink.notes ? (
              <p className="mobile-sheet-notes">{activeLink.notes}</p>
            ) : null}
            <div className="mobile-sheet-actions">
              <button
                onClick={() => {
                  updateLink(activeLink.id, { status: "read" });
                  setMobileSheetOpen(false);
                }}
              >
                <CheckCircle2 size={16} />
                Mark Read
              </button>
              <button
                onClick={() => {
                  updateLink(activeLink.id, { favorite: !activeLink.favorite });
                }}
              >
                <Star
                  size={16}
                  fill={activeLink.favorite ? "#f6bd2f" : "none"}
                  stroke={activeLink.favorite ? "#f6bd2f" : "currentColor"}
                />
                {activeLink.favorite ? "Unfavorite" : "Favorite"}
              </button>
              <button
                onClick={() => {
                  updateLink(activeLink.id, { status: "archived" });
                  setMobileSheetOpen(false);
                }}
              >
                <Archive size={16} />
                Archive
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showAdd ? (
        <AddLinkModal
          categories={settings.categories}
          defaultCategory={defaultAddCategory}
          onClose={() => setShowAdd(false)}
          onAdd={handleAdd}
        />
      ) : null}
      {showImport ? (
        <ImportModal
          onClose={() => setShowImport(false)}
          onImport={handleImport}
        />
      ) : null}
      {showSettings ? (
        <SettingsModal
          settings={settings}
          links={links}
          onClose={() => setShowSettings(false)}
          onAddCategory={addCategory}
          onDeleteCategory={deleteCategory}
          onReorderCategory={reorderCategory}
          onAddTag={addTag}
          onDeleteTag={deleteTag}
        />
      ) : null}
      {showProfile ? (
        <NewProfileModal
          onClose={() => setShowProfile(false)}
          onCreate={handleCreateProfile}
        />
      ) : null}
    </div>
  );
}
