import React, { useEffect, useMemo, useState } from "react";
import { createNote, deleteNote, listNotes, updateNote } from "../api/notesApi";
import { useDebouncedValue } from "../hooks/useDebouncedValue";

function nowIso() {
  return new Date().toISOString();
}

function normalizeNote(note) {
  // Backend may return different shapes; normalize for UI.
  const id = note.id ?? note._id ?? note.noteId ?? note.uuid;
  return {
    id,
    title: note.title ?? "",
    content: note.content ?? "",
    updatedAt: note.updatedAt ?? note.updated_at ?? note.modifiedAt ?? note.modified_at ?? nowIso(),
    createdAt: note.createdAt ?? note.created_at ?? nowIso(),
    raw: note,
  };
}

function formatTimestamp(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts || "");
  return d.toLocaleString();
}

function snippet(text) {
  const s = (text || "").trim().replace(/\s+/g, " ");
  if (!s) return "No content yet.";
  return s.length > 120 ? `${s.slice(0, 120)}…` : s;
}

// PUBLIC_INTERFACE
export default function NotesPage() {
  /** Main notes screen: list + editor. */
  const [notes, setNotes] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 200);

  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [toast, setToast] = useState(null); // { kind: 'error'|'success', message: string }

  const selected = useMemo(() => notes.find((n) => n.id === selectedId) || null, [notes, selectedId]);

  const filteredNotes = useMemo(() => {
    const q = (debouncedSearch || "").trim().toLowerCase();
    const base = [...notes];
    // Sort newest first by updatedAt if present.
    base.sort((a, b) => {
      const at = new Date(a.updatedAt || a.createdAt || 0).getTime();
      const bt = new Date(b.updatedAt || b.createdAt || 0).getTime();
      return bt - at;
    });
    if (!q) return base;
    return base.filter((n) => (n.title || "").toLowerCase().includes(q) || (n.content || "").toLowerCase().includes(q));
  }, [notes, debouncedSearch]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setIsLoading(true);
      setToast(null);
      try {
        const res = await listNotes();
        const arr = Array.isArray(res) ? res : res?.notes || [];
        const normalized = arr.map(normalizeNote);
        if (cancelled) return;

        setNotes(normalized);

        // Select first note by default.
        const first = normalized[0]?.id ?? null;
        setSelectedId((prev) => prev ?? first);
      } catch (e) {
        if (cancelled) return;
        setToast({ kind: "error", message: e?.message || String(e) });
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Keep draft synced with selected note (but only when selection changes).
  useEffect(() => {
    if (!selected) {
      setDraftTitle("");
      setDraftContent("");
      return;
    }
    setDraftTitle(selected.title || "");
    setDraftContent(selected.content || "");
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  function setSuccess(message) {
    setToast({ kind: "success", message });
  }

  function setError(err) {
    setToast({ kind: "error", message: err?.message || String(err) });
  }

  function hasEdits() {
    if (!selected) return false;
    return (draftTitle || "") !== (selected.title || "") || (draftContent || "") !== (selected.content || "");
  }

  async function handleNew() {
    setToast(null);
    setSelectedId(null);
    setDraftTitle("Untitled");
    setDraftContent("");
  }

  async function handleSave() {
    setToast(null);

    const title = (draftTitle || "").trim();
    const content = (draftContent || "").trimEnd(); // allow leading whitespace, keep user's formatting mostly

    if (!title) {
      setError(new Error("Title is required."));
      return;
    }

    setIsSaving(true);
    try {
      if (!selectedId) {
        const created = await createNote({ title, content });
        const normalized = normalizeNote(created);
        setNotes((prev) => [normalized, ...prev]);
        setSelectedId(normalized.id);
        setSuccess("Note created.");
      } else {
        const updated = await updateNote(selectedId, { title, content });
        const normalized = normalizeNote(updated);
        setNotes((prev) => prev.map((n) => (n.id === selectedId ? { ...n, ...normalized } : n)));
        setSuccess("Note saved.");
      }
    } catch (e) {
      setError(e);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId) {
      setError(new Error("Select a note to delete."));
      return;
    }

    setToast(null);
    setIsDeleting(true);
    try {
      await deleteNote(selectedId);
      setNotes((prev) => prev.filter((n) => n.id !== selectedId));
      setSelectedId((prev) => {
        // after deletion, select next available note
        const remaining = notes.filter((n) => n.id !== prev);
        return remaining[0]?.id ?? null;
      });
      setSuccess("Note deleted.");
    } catch (e) {
      setError(e);
    } finally {
      setIsDeleting(false);
    }
  }

  const apiHint = process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL || "<unset>";

  return (
    <div className="App">
      <div className="Container">
        <header className="Header">
          <div className="Brand">
            <div className="TitleRow">
              <h1 className="Title">Retro Notes</h1>
              <span className="Badge">v1 • no-auth</span>
            </div>
            <p className="Subtitle">
              Two-pane notebook. API: <span className="Kbd">{apiHint}</span>
            </p>
          </div>

          <div className="HeaderActions">
            <button type="button" className="Btn BtnSuccess" onClick={handleNew} aria-label="Create a new note">
              + New
            </button>
            <button
              type="button"
              className="Btn BtnPrimary"
              onClick={handleSave}
              disabled={isSaving || (!selectedId && !(draftTitle || "").trim()) || (selectedId && !hasEdits())}
              aria-label="Save note"
              title={selectedId ? (hasEdits() ? "Save changes" : "No changes to save") : "Create note"}
            >
              {isSaving ? "Saving…" : selectedId ? "Save" : "Create"}
            </button>
            <button
              type="button"
              className="Btn BtnDanger"
              onClick={handleDelete}
              disabled={isDeleting || !selectedId}
              aria-label="Delete note"
            >
              {isDeleting ? "Deleting…" : "Delete"}
            </button>
          </div>
        </header>

        {toast ? (
          <div className={`Toast ${toast.kind === "error" ? "ToastError" : "ToastSuccess"}`} role="status">
            {toast.message}
          </div>
        ) : null}

        <main className="Main">
          <section className="Panel" aria-label="Notes list">
            <div className="PanelHeader">
              <h2 className="PanelTitle">Notes</h2>
              <span className="Badge">{filteredNotes.length}</span>
            </div>
            <div className="PanelBody">
              <div className="Row" style={{ marginBottom: 12 }}>
                <input
                  className="SearchInput"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search title or content…"
                  aria-label="Search notes"
                />
              </div>

              {isLoading ? (
                <div className="EmptyState">Loading notes…</div>
              ) : filteredNotes.length === 0 ? (
                <div className="EmptyState">
                  No notes found. Press <span className="Kbd">New</span> to create one.
                </div>
              ) : (
                <div className="NoteList" role="list">
                  {filteredNotes.map((n) => {
                    const active = n.id === selectedId;
                    return (
                      <div
                        key={n.id}
                        role="listitem"
                        className={`NoteCard ${active ? "NoteCardActive" : ""}`}
                        onClick={() => setSelectedId(n.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") setSelectedId(n.id);
                        }}
                        tabIndex={0}
                        aria-label={`Open note ${n.title || "Untitled"}`}
                      >
                        <p className="NoteCardTitle">{n.title || "Untitled"}</p>
                        <p className="NoteCardSnippet">{snippet(n.content)}</p>
                        <div className="NoteCardMeta">
                          <span>Updated</span>
                          <span className="Kbd">{formatTimestamp(n.updatedAt || n.createdAt)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>

          <section className="Panel" aria-label="Note editor">
            <div className="PanelHeader">
              <h2 className="PanelTitle">{selectedId ? "Editor" : "New note"}</h2>
              <span className="Badge">{selectedId ? "edit" : "draft"}</span>
            </div>
            <div className="PanelBody">
              <form
                className="Form"
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSave();
                }}
              >
                <label className="Label">
                  Title
                  <input
                    className="Input"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder="e.g., Shopping list"
                    maxLength={120}
                    required
                  />
                </label>

                <label className="Label">
                  Content
                  <textarea
                    className="Textarea"
                    value={draftContent}
                    onChange={(e) => setDraftContent(e.target.value)}
                    placeholder="Write something…"
                  />
                </label>

                <div className="FormActions">
                  <button type="submit" className="Btn BtnPrimary" disabled={isSaving}>
                    {isSaving ? "Saving…" : selectedId ? "Save" : "Create"}
                  </button>
                  <button
                    type="button"
                    className="Btn"
                    disabled={isSaving}
                    onClick={() => {
                      // Reset draft to selected note
                      if (!selected) {
                        setDraftTitle("Untitled");
                        setDraftContent("");
                      } else {
                        setDraftTitle(selected.title || "");
                        setDraftContent(selected.content || "");
                      }
                      setToast(null);
                    }}
                  >
                    Reset
                  </button>

                  <span className="Badge" title="Tip">
                    Tip: <span className="Kbd">Enter</span> saves
                  </span>
                </div>
              </form>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
