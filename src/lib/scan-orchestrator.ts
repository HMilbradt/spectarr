import { z } from 'zod';
import sharp from 'sharp';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/index';
import { images, scans, scanItems, usageRecords } from '@/lib/db/schema';
import { callOpenRouter, calculateCost, isOpenRouterConfigured } from '@/lib/openrouter';
import { SYSTEM_PROMPT, buildUserMessage } from '@/lib/prompts';
import { SUPPORTED_MODELS, IMAGE_MAX_DIMENSION, IMAGE_JPEG_QUALITY, IMAGE_MAX_FILE_SIZE } from '@/lib/constants';
import { enrichItems, isTMDBConfigured } from '@/lib/metadata';
import { isPlexConfigured, fetchAllPlexItems, matchWithPlex } from '@/lib/plex';
import { log } from '@/lib/logger';
import type { SSEWriter } from '@/lib/sse';
import type { LLMIdentifiedItem, ScanDetail, ScanItemRow, ScanStatus } from '@/types';

const MODULE = 'orchestrator';

// ─── Zod schemas for LLM output validation ──────────────

const ItemTypeSchema = z.enum(['movie', 'tv', 'dvd', 'vinyl', 'game', 'other']);

const LLMItemSchema = z.object({
  title: z.string().min(1),
  creator: z.string(),
  type: ItemTypeSchema,
  year: z.number().optional(),
});

const LLMResponseSchema = z.object({
  items: z.array(LLMItemSchema),
});

// ─── Helpers ─────────────────────────────────────────────

function tryParseJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch { /* noop */ }

  const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim());
    } catch { /* noop */ }
  }

  return null;
}

function coerceItemTypes(data: unknown): unknown {
  if (typeof data !== 'object' || data === null) return data;
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.items)) {
    obj.items = obj.items.map((item: unknown) => {
      if (typeof item === 'object' && item !== null) {
        const i = item as Record<string, unknown>;
        if (typeof i.type === 'string') {
          i.type = i.type.toLowerCase();
          if (i.type === 'book') i.type = 'other';
        }
        if ('author' in i && !('creator' in i)) {
          i.creator = i.author;
          delete i.author;
        }
        if (typeof i.year === 'string') {
          const parsed = parseInt(i.year);
          i.year = isNaN(parsed) ? undefined : parsed;
        }
      }
      return item;
    });
  }
  return obj;
}

async function hashBuffer(buffer: Buffer): Promise<string> {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function updateScanStatus(scanId: string, status: ScanStatus, writer?: SSEWriter) {
  const db = getDb();
  const now = Date.now();
  db.update(scans).set({ status, updatedAt: now }).where(eq(scans.id, scanId)).run();
  writer?.send('status', { status });
}

function buildScanDetail(scanId: string): ScanDetail {
  const db = getDb();
  const scan = db.select().from(scans).where(eq(scans.id, scanId)).get();
  if (!scan) throw new Error(`Scan not found: ${scanId}`);

  const items = db.select().from(scanItems).where(eq(scanItems.scanId, scanId)).all();

  return {
    id: scan.id,
    imageId: scan.imageId,
    modelId: scan.modelId,
    status: scan.status as ScanStatus,
    createdAt: scan.createdAt,
    updatedAt: scan.updatedAt,
    items: items as ScanItemRow[],
  };
}

// ─── Full Scan Pipeline ──────────────────────────────────

export interface RunScanOptions {
  imageBuffer: Buffer;
  mimeType: string;
  modelId: string;
  writer?: SSEWriter;
}

export async function runFullScan({ imageBuffer, mimeType, modelId, writer }: RunScanOptions): Promise<ScanDetail> {
  const db = getDb();
  const now = Date.now();

  // Validate configuration
  if (!isOpenRouterConfigured()) throw new Error('OpenRouter is not configured');
  if (!isTMDBConfigured()) throw new Error('TMDB is not configured');

  if (imageBuffer.length > IMAGE_MAX_FILE_SIZE) {
    throw new Error('Image exceeds 20MB limit');
  }

  const model = SUPPORTED_MODELS.find(m => m.id === modelId);
  if (!model) throw new Error(`Invalid model ID: ${modelId}`);

  // 1. Store image (deduplicate by hash)
  const hash = await hashBuffer(imageBuffer);
  let imageRow = db.select().from(images).where(eq(images.hash, hash)).get();

  if (!imageRow) {
    const imageId = crypto.randomUUID();
    db.insert(images).values({
      id: imageId,
      hash,
      data: imageBuffer,
      mimeType,
      createdAt: now,
    }).run();
    imageRow = { id: imageId, hash, data: imageBuffer, mimeType, createdAt: now };
  }

  // 2. Create scan record
  const scanId = crypto.randomUUID();
  db.insert(scans).values({
    id: scanId,
    imageId: imageRow.id,
    modelId: model.id,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  }).run();

  writer?.send('created', { scanId });

  try {
    // 3. Analyze with LLM
    updateScanStatus(scanId, 'analyzing', writer);

    const processed = await sharp(imageBuffer)
      .resize(IMAGE_MAX_DIMENSION, IMAGE_MAX_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: IMAGE_JPEG_QUALITY })
      .toBuffer();

    const base64Image = processed.toString('base64');
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      buildUserMessage(base64Image, 'image/jpeg'),
    ];

    let llmItems: LLMIdentifiedItem[] | null = null;
    let rawResponseContent: string | null = null;
    let lastError: string | null = null;
    let usageData: { inputTokens: number; outputTokens: number; model: string } | null = null;

    for (let attempt = 0; attempt < 2; attempt++) {
      log.info(MODULE, 'Calling LLM', { model: model.id, attempt: attempt + 1 });

      const response = await callOpenRouter({
        model: model.id,
        messages,
        max_tokens: 4096,
        temperature: 0.1,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        lastError = 'LLM returned empty response';
        continue;
      }

      rawResponseContent = content;
      usageData = {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        model: response.model || model.id,
      };

      let parsed = tryParseJson(content);
      if (!parsed) {
        lastError = `Failed to parse JSON: ${content.slice(0, 200)}`;
        continue;
      }

      parsed = coerceItemTypes(parsed);
      const validated = LLMResponseSchema.safeParse(parsed);

      if (!validated.success) {
        lastError = `Validation failed: ${validated.error.message}`;
        continue;
      }

      llmItems = validated.data.items;
      break;
    }

    if (!llmItems || !usageData) {
      throw new Error(`Failed to parse LLM response: ${lastError}`);
    }

    // Store raw response and usage
    const costUsd = calculateCost(
      usageData.inputTokens,
      usageData.outputTokens,
      model.inputCostPerMTokens,
      model.outputCostPerMTokens
    );

    db.update(scans)
      .set({ rawResponse: rawResponseContent, updatedAt: Date.now() })
      .where(eq(scans.id, scanId))
      .run();

    db.insert(usageRecords).values({
      id: crypto.randomUUID(),
      scanId,
      model: usageData.model,
      inputTokens: usageData.inputTokens,
      outputTokens: usageData.outputTokens,
      costUsd,
      createdAt: Date.now(),
    }).run();

    log.info(MODULE, 'LLM scan complete', {
      itemsFound: llmItems.length,
      costUsd,
    });

    // 4. Enrich with metadata
    await enrichAndSaveItems(scanId, llmItems, writer);

    // 5. Mark complete
    updateScanStatus(scanId, 'complete', writer);

    const detail = buildScanDetail(scanId);
    writer?.send('complete', { scan: detail });
    writer?.close();

    return detail;
  } catch (error) {
    updateScanStatus(scanId, 'error', writer);
    const message = error instanceof Error ? error.message : 'Unknown error';
    writer?.send('error', { message });
    writer?.close();
    throw error;
  }
}

// ─── Re-scan (same image, new LLM call) ─────────────────

export async function runRescan(originalScanId: string, modelId?: string, writer?: SSEWriter): Promise<ScanDetail> {
  const db = getDb();

  const originalScan = db.select().from(scans).where(eq(scans.id, originalScanId)).get();
  if (!originalScan) throw new Error('Original scan not found');

  const imageRow = db.select().from(images).where(eq(images.id, originalScan.imageId)).get();
  if (!imageRow) throw new Error('Image not found for original scan');

  return runFullScan({
    imageBuffer: Buffer.from(imageRow.data),
    mimeType: imageRow.mimeType,
    modelId: modelId || originalScan.modelId,
    writer,
  });
}

// ─── Re-enrich (metadata only, no new LLM call) ─────────

export async function runReenrich(scanId: string, writer?: SSEWriter): Promise<ScanDetail> {
  const db = getDb();

  const scan = db.select().from(scans).where(eq(scans.id, scanId)).get();
  if (!scan) throw new Error('Scan not found');
  if (!scan.rawResponse) throw new Error('No raw LLM response stored for this scan — cannot re-enrich');

  try {
    // Parse stored raw response
    let parsed = tryParseJson(scan.rawResponse);
    if (!parsed) throw new Error('Failed to parse stored raw response');

    parsed = coerceItemTypes(parsed);
    const validated = LLMResponseSchema.safeParse(parsed);
    if (!validated.success) throw new Error('Stored raw response failed validation');

    const llmItems = validated.data.items;

    // Delete existing scan items
    db.delete(scanItems).where(eq(scanItems.scanId, scanId)).run();

    // Re-enrich
    await enrichAndSaveItems(scanId, llmItems, writer);

    // Mark complete
    updateScanStatus(scanId, 'complete', writer);

    const detail = buildScanDetail(scanId);
    writer?.send('complete', { scan: detail });
    writer?.close();

    return detail;
  } catch (error) {
    updateScanStatus(scanId, 'error', writer);
    const message = error instanceof Error ? error.message : 'Unknown error';
    writer?.send('error', { message });
    writer?.close();
    throw error;
  }
}

// ─── Shared enrichment + save logic ─────────────────────

async function enrichAndSaveItems(
  scanId: string,
  llmItems: LLMIdentifiedItem[],
  writer?: SSEWriter,
) {
  const db = getDb();

  updateScanStatus(scanId, 'enriching', writer);

  // Enrich via TMDB + TVDB
  const enriched = await enrichItems(llmItems);

  // Cross-reference with Plex if configured
  if (isPlexConfigured()) {
    try {
      const plexItems = await fetchAllPlexItems();
      for (const item of enriched) {
        const plexMatch = matchWithPlex(item.title, item.year, plexItems);
        if (plexMatch.matched) {
          item.plexMatch = true;
          item.plexRatingKey = plexMatch.plexRatingKey;
          if (!item.imdbId && plexMatch.imdbId) item.imdbId = plexMatch.imdbId;
          if (!item.tvdbId && plexMatch.tvdbId) {
            item.tvdbId = parseInt(plexMatch.tvdbId, 10) || null;
          }
        }
      }
    } catch (error) {
      log.warn(MODULE, 'Plex cross-reference failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  // Save enriched items
  const now = Date.now();
  for (let i = 0; i < enriched.length; i++) {
    const item = enriched[i];
    const raw = llmItems[i];

    db.insert(scanItems).values({
      id: crypto.randomUUID(),
      scanId,
      title: item.title,
      creator: item.creator,
      type: item.type,
      confidence: item.confidence,
      source: item.source,
      tmdbId: item.tmdbId,
      imdbId: item.imdbId,
      tvdbId: item.tvdbId,
      posterUrl: item.posterUrl,
      overview: item.overview,
      rating: item.rating,
      releaseDate: item.releaseDate,
      genres: item.genres,
      year: item.year,
      director: item.director,
      runtime: item.runtime,
      network: item.network,
      seasons: item.seasons,
      showStatus: item.showStatus,
      plexMatch: item.plexMatch ?? false,
      plexRatingKey: item.plexRatingKey,
      rawTitle: raw.title,
      rawCreator: raw.creator,
      rawType: raw.type,
      rawYear: raw.year ?? null,
      createdAt: now,
      updatedAt: now,
    }).run();
  }

  log.info(MODULE, 'Enrichment complete', { itemCount: enriched.length });
}
