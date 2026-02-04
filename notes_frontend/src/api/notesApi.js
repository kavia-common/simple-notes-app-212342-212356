/**
 * Notes API client for the frontend.
 *
 * The backend base URL is resolved from environment variables:
 * - REACT_APP_API_BASE (preferred) or REACT_APP_BACKEND_URL
 *
 * Expected REST endpoints (common CRUD shape):
 * - GET    /notes
 * - POST   /notes
 * - PUT    /notes/:id
 * - DELETE /notes/:id
 *
 * If your backend differs, adjust the paths here (single place).
 */

function getApiBase() {
  const raw = process.env.REACT_APP_API_BASE || process.env.REACT_APP_BACKEND_URL || "";
  return raw.replace(/\/+$/, ""); // trim trailing slashes
}

async function parseJsonOrText(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

async function request(path, options = {}) {
  const base = getApiBase();
  if (!base) {
    throw new Error(
      "Missing API base URL. Set REACT_APP_API_BASE (preferred) or REACT_APP_BACKEND_URL in the environment."
    );
  }

  const url = `${base}${path.startsWith("/") ? "" : "/"}${path}`;

  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (e) {
    throw new Error(`Network error contacting backend at ${base}. ${e?.message || String(e)}`);
  }

  if (!response.ok) {
    const payload = await parseJsonOrText(response);
    const details = typeof payload === "string" ? payload : JSON.stringify(payload);
    throw new Error(`API error ${response.status} ${response.statusText}: ${details}`);
  }

  // 204 No Content
  if (response.status === 204) return null;
  return parseJsonOrText(response);
}

// PUBLIC_INTERFACE
export async function listNotes() {
  /** Fetch all notes. Returns an array of {id, title, content, ...}. */
  return request("/notes", { method: "GET" });
}

// PUBLIC_INTERFACE
export async function createNote(note) {
  /** Create a note. note: {title, content}. Returns created note. */
  if (!note || typeof note.title !== "string" || typeof note.content !== "string") {
    throw new Error("Invalid note payload. Expected {title: string, content: string}.");
  }
  return request("/notes", { method: "POST", body: JSON.stringify(note) });
}

// PUBLIC_INTERFACE
export async function updateNote(id, note) {
  /** Update a note by id. note: {title, content}. Returns updated note. */
  if (!id) throw new Error("Missing note id.");
  if (!note || typeof note.title !== "string" || typeof note.content !== "string") {
    throw new Error("Invalid note payload. Expected {title: string, content: string}.");
  }
  return request(`/notes/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(note) });
}

// PUBLIC_INTERFACE
export async function deleteNote(id) {
  /** Delete a note by id. Returns null/response depending on backend. */
  if (!id) throw new Error("Missing note id.");
  return request(`/notes/${encodeURIComponent(id)}`, { method: "DELETE" });
}
