// Refactored syncService with extra debugging helpers and a single export.
// Replace the existing syncService.js with this file during local debugging.

import { BatchWriteItemCommand, DeleteItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { ENABLE_BACKGROUND_SYNC } from "./constants";
import { AWS_REGION, getDynamoClient } from "./awsClients";

const SEGMENT_BATCH_LIMIT = 25;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

// Lazy dynamo client
const dynamoClient = ENABLE_BACKGROUND_SYNC ? getDynamoClient() : null;

// Verbose debug flag - set import.meta.env.VITE_SYNC_VERBOSE=true or window.__SYNC_VERBOSE = true
const SYNC_VERBOSE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_SYNC_VERBOSE === "true") ||
  (typeof window !== "undefined" && window.__SYNC_VERBOSE === true) ||
  false;

function logDebug(...args) {
  if (SYNC_VERBOSE) console.debug(...args);
}

class SyncQueue {
  constructor() {
    this.items = [];
    this.flushing = false;
    this.stats = {
      total: 0,
      success: 0,
      failed: 0,
      retried: 0,
    };
  }

  enqueue(task, meta = {}) {
    const callerStack = new Error().stack?.split("\n").slice(2, 6).join("\n") ?? "";
    console.info("[sync][queue] enqueue called", { label: meta.label ?? "task", meta, ENABLE_BACKGROUND_SYNC });
    logDebug("[sync][queue] enqueue caller", callerStack);

    if (!ENABLE_BACKGROUND_SYNC) {
      console.info("[sync][queue] enqueue skipped - background sync disabled", { meta });
      return;
    }

    const wrapped = {
      run: task,
      meta,
      retryCount: 0,
      createdAt: new Date().toISOString(),
      callerStack,
    };

    this.items.push(wrapped);
    this.stats.total++;
    console.info("[sync][queue] queued", meta.label ?? "task", "pending=", this.items.length, "totalEnqueued=", this.stats.total);
    logDebug("[sync][queue] queue snapshot", this.items.map(i => ({ label: i.meta.label, retryCount: i.retryCount })));
  }

  async flushAll(reason = "unspecified") {
    if (!ENABLE_BACKGROUND_SYNC) {
      console.info("[sync][queue] flush skipped because background sync disabled");
      return;
    }

    if (this.flushing) {
      console.info("[sync][queue] flush skipped (already flushing)", { reason });
      return;
    }

    if (this.items.length === 0) {
      console.info("[sync][queue] flush skipped (empty queue)", { reason });
      return;
    }

    this.flushing = true;
    console.info("[sync][queue] flush start", { reason, pending: this.items.length, stats: this.stats });

    try {
      const failedItems = [];

      while (this.items.length > 0) {
        const item = this.items.shift();
        console.info("[sync][queue] executing task", item.meta.label ?? "task", "remaining=", this.items.length, "retryCount=", item.retryCount);

        try {
          // eslint-disable-next-line no-await-in-loop
          await item.run();
          this.stats.success++;
          console.info("[sync][queue] task completed", item.meta.label ?? "task");
        } catch (error) {
          console.error("[sync][queue] task failed", { label: item.meta.label, error, retryCount: item.retryCount, callerStack: item.callerStack });

          if (item.retryCount < MAX_RETRIES) {
            item.retryCount++;
            this.stats.retried++;
            failedItems.push(item);
            // backoff
            // eslint-disable-next-line no-await-in-loop
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * Math.pow(2, item.retryCount - 1)));
          } else {
            this.stats.failed++;
            console.error("[sync][queue] max retries exceeded, abandoning task", { label: item.meta.label, error });
          }
        }
      }

      if (failedItems.length > 0) {
        this.items.push(...failedItems);
        console.info("[sync][queue] re-queued failed items", { count: failedItems.length, pendingNow: this.items.length });
      }
    } finally {
      this.flushing = false;
      console.info("[sync][queue] flush complete", { reason, stats: this.stats, pendingItems: this.items.length });
    }
  }

  // Dev helpers
  dump() {
    return this.items.map((it, idx) => ({ idx, label: it.meta.label, retryCount: it.retryCount, createdAt: it.createdAt, meta: it.meta }));
  }

  peek() {
    return this.items[0] ?? null;
  }
}

const queue = new SyncQueue();

function safeSendPut(tableName, item, debugLabel) {
  return async () => {
    if (!dynamoClient) {
      console.warn("[sync][dynamodb] PutItem skipped: dynamoClient unavailable", { tableName, debugLabel });
      return;
    }
    console.info("[sync][dynamodb] PutItem start", { tableName, debugLabel });
    try {
      await dynamoClient.send(new PutItemCommand({ TableName: tableName, Item: item }));
      console.info("[sync][dynamodb] PutItem success", { tableName, debugLabel });
    } catch (err) {
      console.error("[sync][dynamodb] PutItem error", { tableName, debugLabel, error: err });
      throw err;
    }
  };
}

function safeSendDelete(tableName, key, debugLabel) {
  return async () => {
    if (!dynamoClient) {
      console.warn("[sync][dynamodb] DeleteItem skipped: dynamoClient unavailable", { tableName, debugLabel });
      return;
    }
    console.info("[sync][dynamodb] DeleteItem start", { tableName, debugLabel });
    try {
      await dynamoClient.send(new DeleteItemCommand({ TableName: tableName, Key: key }));
      console.info("[sync][dynamodb] DeleteItem success", { tableName, debugLabel });
    } catch (err) {
      console.error("[sync][dynamodb] DeleteItem error", { tableName, debugLabel, error: err });
      throw err;
    }
  };
}

function safeBatchWrite(requestItems, debugLabel) {
  return async () => {
    if (!dynamoClient) {
      console.warn("[sync][dynamodb] BatchWrite skipped: dynamoClient unavailable", { debugLabel });
      return;
    }
    console.info("[sync][dynamodb] BatchWrite start", { debugLabel });
    try {
      await dynamoClient.send(new BatchWriteItemCommand({ RequestItems: requestItems }));
      console.info("[sync][dynamodb] BatchWrite success", { debugLabel });
    } catch (err) {
      console.error("[sync][dynamodb] BatchWrite error", { debugLabel, error: err });
      throw err;
    }
  };
}

console.info("[sync] ENABLE_BACKGROUND_SYNC", ENABLE_BACKGROUND_SYNC);
console.info("[sync] AWS_REGION", AWS_REGION);

const syncService = {
  enqueuePatientUpsert(patient) {
    console.info("[syncService] enqueuePatientUpsert invoked", { id: patient?.id, ownerUserId: patient?.ownerUserId });
    queue.enqueue(
      safeSendPut("medical-scribe-patients", {
        id: { S: patient.id },
        ownerUserId: { S: patient.ownerUserId },
        displayName: { S: patient.displayName },
        profile: {
          M: Object.fromEntries(
            Object.entries(patient.profile ?? {}).flatMap(([key, value]) => {
              if (value === undefined || value === null || value === "") return [];
              return [[key, { S: String(value) }]];
            })
          ),
        },
        createdAt: { S: patient.createdAt },
        ...(patient.updatedAt ? { updatedAt: { S: patient.updatedAt } } : {}),
      }, `patient:${patient.id}`),
      { label: `patient:${patient.id}`, type: "patient", ownerUserId: patient.ownerUserId }
    );
  },

  enqueuePatientDeletion(patientId, ownerUserId) {
    console.info("[syncService] enqueuePatientDeletion invoked", { patientId, ownerUserId });
    queue.enqueue(
      safeSendDelete("medical-scribe-patients", { id: { S: patientId } }, `delete-patient:${patientId}`),
      { label: `delete-patient:${patientId}`, type: "delete:patient", ownerUserId }
    );
  },

  enqueueConsultationUpsert(consultation) {
    console.info("[syncService] enqueueConsultationUpsert invoked", { id: consultation?.id, ownerUserId: consultation?.ownerUserId });
    queue.enqueue(
      safeSendPut("medical-scribe-consultations", {
        id: { S: consultation.id },
        ownerUserId: { S: consultation.ownerUserId },
        patientId: { S: consultation.patientId ?? "" },
        patientName: { S: consultation.patientName ?? "" },
        title: { S: consultation.title ?? "" },
        noteType: { S: consultation.noteType ?? "" },
        language: { S: consultation.language ?? "" },
        additionalContext: { S: consultation.additionalContext ?? "" },
        speakerRoles: {
          M: Object.entries(consultation.speakerRoles || {}).reduce((acc, [speakerId, role]) => {
            if (!role) return acc;
            acc[speakerId] = { S: role };
            return acc;
          }, {}),
        },
        sessionState: { S: consultation.sessionState ?? "" },
        connectionStatus: { S: consultation.connectionStatus ?? "" },
        hasShownHint: { BOOL: Boolean(consultation.hasShownHint) },
        customNameSet: { BOOL: Boolean(consultation.customNameSet) },
        activeTab: { S: consultation.activeTab ?? "" },
        createdAt: { S: consultation.createdAt ?? "" },
        updatedAt: { S: consultation.updatedAt ?? "" },
      }, `consultation:${consultation.id}`),
      { label: `consultation:${consultation.id}`, type: "consultation", ownerUserId: consultation.ownerUserId }
    );
  },

  enqueueConsultationDeletion(consultationId, ownerUserId) {
    console.info("[syncService] enqueueConsultationDeletion invoked", { consultationId, ownerUserId });
    queue.enqueue(
      safeSendDelete("medical-scribe-consultations", { id: { S: consultationId } }, `delete-consultation:${consultationId}`),
      { label: `delete-consultation:${consultationId}`, type: "delete:consultation", ownerUserId }
    );
  },

  enqueueClinicalNote(note) {
    console.info("[syncService] enqueueClinicalNote invoked", { id: note?.id, ownerUserId: note?.ownerUserId });
    const item = {
      id: { S: note.id },
      ownerUserId: { S: note.ownerUserId },
      consultationId: { S: note.consultationId },
      noteType: { S: note.noteType },
      content: { S: note.content },
      createdAt: { S: note.createdAt },
      updatedAt: { S: note.updatedAt },
    };
    if (note.title) item.title = { S: note.title };
    if (note.language) item.language = { S: note.language };
    if (note.summary) item.summary = { S: note.summary };
    if (note.status) item.status = { S: note.status };

    queue.enqueue(
      safeSendPut("medical-scribe-clinical-notes", item, note.debugLabel),
      { label: `clinical-note:${note.id}`, type: "clinical-note", ownerUserId: note.ownerUserId }
    );
  },

  enqueueClinicalNoteDeletion(noteId, ownerUserId) {
    console.info("[syncService] enqueueClinicalNoteDeletion invoked", { noteId, ownerUserId });
    queue.enqueue(
      safeSendDelete("medical-scribe-clinical-notes", { id: { S: noteId } }, `delete-clinical-note:${noteId}`),
      { label: `delete-clinical-note:${noteId}`, type: "delete:clinical-note", ownerUserId }
    );
  },

  enqueueTemplateUpsert(template) {
    if (!template?.id) {
      console.warn("[syncService] enqueueTemplateUpsert skipped - missing template.id", template);
      return;
    }
    console.info("[syncService] enqueueTemplateUpsert invoked", { id: template.id, ownerUserId: template.ownerUserId });
    const item = {
      id: { S: template.id },
      ownerUserId: { S: template.ownerUserId },
      name: { S: template.name || "" },
      sections: { S: JSON.stringify(template.sections || []) },
      example_text: { S: template.example_text ?? "" },
      // Use snake_case timestamps to match backend schema expectations
      created_at: { S: template.created_at ?? template.createdAt ?? new Date().toISOString() },
      updated_at: { S: template.updated_at ?? template.updatedAt ?? new Date().toISOString() },
    };
    queue.enqueue(
      safeSendPut("medical-scribe-templates", item, `template:${template.id}`),
      { label: `template:${template.id}`, type: "template", ownerUserId: template.ownerUserId }
    );
  },

  enqueueTemplateDeletion(templateId, ownerUserId) {
    if (!templateId) return;
    console.info("[syncService] enqueueTemplateDeletion invoked", { templateId, ownerUserId });
    queue.enqueue(
      safeSendDelete("medical-scribe-templates", { id: { S: templateId } }, `delete-template:${templateId}`),
      { label: `delete-template:${templateId}`, type: "delete:template", ownerUserId }
    );
  },

  enqueueTranscriptSegments(consultationId, segments, startingIndex, ownerUserId) {
    console.info("[syncService] enqueueTranscriptSegments", { consultationId, segmentsLength: segments?.length, startingIndex, ownerUserId });

    if (!ENABLE_BACKGROUND_SYNC || !segments?.length) {
      console.info("[syncService] enqueueTranscriptSegments skipped (disabled or empty)");
      return;
    }
    if (!ownerUserId) {
      console.warn("[syncService] missing ownerUserId, skipping segments batch", { consultationId });
      return;
    }
    if (!consultationId) {
      console.error("[syncService] missing consultationId for segments");
      return;
    }
    if (startingIndex === null || startingIndex === undefined || !Number.isFinite(startingIndex)) {
      console.error("[syncService] invalid startingIndex for segments", { startingIndex });
      return;
    }

    for (let i = 0; i < segments.length; i += SEGMENT_BATCH_LIMIT) {
      const batch = segments.slice(i, i + SEGMENT_BATCH_LIMIT);
      const batchItems = batch.map((segment, idx) => {
        const segmentIndex = startingIndex + i + idx;
        if (!Number.isFinite(segmentIndex) || !segment || !segment.id) {
          console.error("[syncService] invalid segment in batch", { segment, segmentIndex });
          return null;
        }

        return {
          PutRequest: {
            Item: {
              consultationId: { S: consultationId },
              segmentIndex: { N: segmentIndex.toString() },
              ownerUserId: { S: ownerUserId },
              segmentId: { S: segment.id },
              speaker: segment.speaker ? { S: segment.speaker } : { NULL: true },
              text: { S: segment.text || "" },
              displayText: segment.displayText ? { S: segment.displayText } : { S: segment.text || "" },
              translatedText: segment.translatedText ? { S: segment.translatedText } : { NULL: true },
              entities: {
                L: (segment.entities || []).map((entity) => ({
                  M: {
                    BeginOffset: { N: (entity.BeginOffset || 0).toString() },
                    EndOffset: { N: (entity.EndOffset || 0).toString() },
                    Category: { S: entity.Category || "OTHER" },
                    Type: { S: entity.Type || "OTHER" },
                  },
                })),
              },
              createdAt: { S: new Date().toISOString() },
            },
          },
        };
      }).filter(Boolean);

      if (batchItems.length === 0) {
        console.warn("[syncService] No valid segments in batch, skipping");
        continue;
      }

      const debugLabel = `segments:${consultationId}:${startingIndex + i}-${startingIndex + i + batchItems.length - 1}`;
      console.info("[syncService] enqueueing segments batch", { debugLabel, batchSize: batchItems.length });

      queue.enqueue(
        safeBatchWrite({ "medical-scribe-transcript-segments": batchItems }, debugLabel),
        { label: `segments:${consultationId}:${startingIndex + i}`, type: "segments", ownerUserId, batchSize: batchItems.length }
      );
    }
  },

  enqueueSegmentDeletion(segmentId, consultationId, ownerUserId) {
    console.info("[syncService] enqueueSegmentDeletion invoked", { segmentId, consultationId, ownerUserId });
    queue.enqueue(
      safeSendDelete("medical-scribe-transcript-segments", { segmentId: { S: segmentId } }, `delete-segment:${segmentId}`),
      { label: `delete-segment:${segmentId}`, type: "delete:segment", ownerUserId }
    );
  },

  async flushAll(reason = "manual") {
    await queue.flushAll(reason);
  },

  // Debug & inspection helpers
  getStats() {
    return { pendingItems: queue.items.length, ...queue.stats };
  },

  dumpQueue() {
    return queue.dump();
  },

  peek() {
    return queue.peek();
  },

  resetStats() {
    queue.stats = { total: 0, success: 0, failed: 0, retried: 0 };
    return queue.stats;
  },
};

// Expose internals in dev for easier console access
if (import.meta.env.DEV || typeof window !== "undefined") {
  try {
    // eslint-disable-next-line no-console
    console.info("[sync][debug] exposing syncService and queue on window.__syncService / window.__syncQueue (dev)");
    window.__syncService = window.__syncService || {};
    window.__syncService = { ...window.__syncService, ...syncService };
    window.__syncQueue = queue;
  } catch (e) {
    // ignore
  }
}

export { syncService };