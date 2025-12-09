import { BACKEND_API_URL } from "./constants";

const BASE_URL = BACKEND_API_URL.replace(/\/$/, "");

function buildUrl(path, query) {
  const url = new URL(
    `${BASE_URL}${path.startsWith("/") ? path : `/${path}`}`
  );

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      if (Array.isArray(value)) {
        value.forEach((item) => url.searchParams.append(key, String(item)));
      } else {
        url.searchParams.append(key, String(value));
      }
    });
  }

  return url;
}

async function apiRequest(
  path,
  { method = "GET", body, accessToken, signal, query } = {}
) {
  const url = buildUrl(path, query);

  // IMPORTANT: only set Content-Type when sending a non-GET body to avoid CORS preflight on GET
  const headers = new Headers();
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  if (body != null && method !== "GET") headers.set("Content-Type", "application/json");

  try {
    const response = await fetch(url.toString(), {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });

    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    const isJson = contentType.includes("application/json");

    const payload =
      response.status === 204
        ? null
        : isJson
        ? await response.json().catch(() => null)
        : await response.text().catch(() => null);

    if (!response.ok) {
      let message = `Request failed with status ${response.status}`;
      if (payload && typeof payload === "object" && payload.detail) {
        message = Array.isArray(payload.detail)
          ? `Validation: ${JSON.stringify(payload.detail)}`
          : String(payload.detail);
      } else if (typeof payload === "string" && payload.trim()) {
        message = payload;
      }
      return { ok: false, status: response.status, data: payload, error: new Error(message) };
    }

    return { ok: true, status: response.status, data: payload };
  } catch (error) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    return { ok: false, status: 0, data: null, error: normalized };
  }
}

// Module-scoped caches
// Previously _noteTypesPromise single promise; switched to per-user cache to support templates per-user
const _noteTypesCache = new Map(); // key -> Promise resolving to note types array

// Tiny 2s memo to coalesce repeat segment loads
const _segmentsMemo = new Map(); // key -> { ts: number, res: { ok, status, data, error } }
const SEGMENTS_TTL_MS = 2000;

export const apiClient = {
  listPatients: ({ token, userId, signal } = {}) =>
    apiRequest("/patients", {
      accessToken: token,
      signal,
      query: {
        user_id: userId,
        limit: 1000,
        offset: 0,
        starred_only: undefined,
      },
    }),

  createPatient: ({ token, payload }) =>
    apiRequest("/patients", {
      method: "POST",
      accessToken: token,
      body: payload,
    }),

  updatePatient: ({ token, patientId, payload }) =>
    apiRequest(`/patients/${patientId}`, {
      method: "PATCH",
      accessToken: token,
      body: payload,
    }),

  deletePatient: ({ token, patientId }) =>
    apiRequest(`/patients/${patientId}`, {
      method: "DELETE",
      accessToken: token,
    }),

  listConsultations: ({
    token,
    userId,
    patientId,
    includePatient,
    signal,
  } = {}) =>
    apiRequest("/consultations", {
      accessToken: token,
      signal,
      query: {
        user_id: userId,
        patient_id: patientId,
        limit: 250,
        offset: 0,
        include_patient: includePatient ? "true" : undefined,
      },
    }),

  createConsultation: ({ token, payload }) =>
    apiRequest("/consultations", {
      method: "POST",
      accessToken: token,
      body: payload,
    }),

  updateConsultation: ({ token, consultationId, payload }) =>
    apiRequest(`/consultations/${consultationId}`, {
      method: "PATCH",
      accessToken: token,
      body: payload,
    }),

  deleteConsultation: ({ token, consultationId }) =>
    apiRequest(`/consultations/${consultationId}`, {
      method: "DELETE",
      accessToken: token,
    }),

  listTranscriptSegments: ({ token, consultationId, signal, includeEntities } = {}) => {
    const key = `${consultationId}|${includeEntities ? "1" : "0"}`;
    const now = Date.now();
    const cached = _segmentsMemo.get(key);
    if (cached && now - cached.ts < SEGMENTS_TTL_MS) {
      return Promise.resolve(cached.res);
    }

    return apiRequest(`/transcript-segments/consultations/${consultationId}/segments`, {
      accessToken: token,
      signal,
      query: { include_entities: includeEntities ? "true" : undefined },
    }).then((res) => {
      _segmentsMemo.set(key, { ts: Date.now(), res });
      return res;
    });
  },

  createTranscriptSegment: ({ token, consultationId, payload }) =>
    apiRequest(`/transcript-segments/consultations/${consultationId}/segments`, {
      method: "POST",
      accessToken: token,
      body: payload,
    }),

  enrichTranscriptSegments: ({ token, consultationId, force } = {}) =>
    apiRequest(`/transcript-segments/consultations/${consultationId}/enrich`, {
      method: "POST",
      accessToken: token,
      query: { force: force ? "true" : undefined },
    }),

  updateTranscriptSegment: ({ token, segmentId, payload }) =>
    apiRequest(`/transcript-segments/segments/${segmentId}`, {
      method: "PATCH",
      accessToken: token,
      body: payload,
    }),

  deleteTranscriptSegment: ({ token, segmentId }) =>
    apiRequest(`/transcript-segments/segments/${segmentId}`, {
      method: "DELETE",
      accessToken: token,
    }),

  getClinicalNote: ({ token, consultationId, signal }) =>
    apiRequest(`/clinical-notes/consultations/${consultationId}/clinical-note`, {
      accessToken: token,
      signal,
    }),

  upsertClinicalNote: ({ token, consultationId, payload }) =>
    apiRequest(`/clinical-notes/consultations/${consultationId}/clinical-note`, {
      method: "PUT",
      accessToken: token,
      body: payload,
    }),

  listTemplates: ({ token, userId, signal } = {}) =>
    apiRequest("/templates/", {
      accessToken: token,
      signal,
      query: {
        user_id: userId,
        limit: 100,
        offset: 0,
      },
    }),

  createTemplate: ({ token, userId, payload }) =>
    apiRequest("/templates/", {
      method: "POST",
      accessToken: token,
      body: payload,
      query: {
        user_id: userId,
      },
    }),

  updateTemplate: ({ token, templateId, payload }) =>
    apiRequest(`/templates/${templateId}`, {
      method: "PATCH",
      accessToken: token,
      body: payload,
    }),

  deleteTemplate: ({ token, templateId }) =>
    apiRequest(`/templates/${templateId}`, {
      method: "DELETE",
      accessToken: token,
    }),

  /**
   * Get cached note types. Optionally pass { userId } to include user templates.
   * Returns a Promise resolving to an array of note type objects.
   */
  getNoteTypesCached: ({ userId, force = false } = {}) => {
    const key = userId ? String(userId) : "anon";

    if (!force && _noteTypesCache.has(key)) {
      return _noteTypesCache.get(key);
    }

    const p = apiRequest("/note-types", {
      query: { user_id: userId || undefined },
    })
      .then((res) => {
        if (res.ok && res.data && Array.isArray(res.data.note_types)) return res.data.note_types;
        throw new Error(res.error?.message || "Failed to load note types");
      })
      .catch((err) => {
        console.warn("[apiClient] getNoteTypesCached fallback due to error:", err?.message);
        return [];
      });

    _noteTypesCache.set(key, p);
    return p;
  },

  // Small helper to invalidate cached values (useful on sign-in / user change)
  invalidateNoteTypesCache: (userId) => {
    if (userId) {
      _noteTypesCache.delete(String(userId));
    } else {
      _noteTypesCache.clear();
    }
  },
};

export { apiRequest };