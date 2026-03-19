import { GoogleGenAI } from "@google/genai";
import { PromptGroup, ImageSize, ImageModel, BatchJob, BatchJobState } from '../types';
import { buildEnhancedPrompt, buildReferencePrompt, buildTurnaroundFromRefPrompt, extractImageFromResponse } from './geminiService';

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Creates a standard batch job for image generation with 50% cost reduction.
 * Results are available within 24 hours (usually much sooner).
 */
export const createBatchJob = async (
  groups: PromptGroup[],
  imageSize: ImageSize,
  model: ImageModel
): Promise<BatchJob> => {
  const ai = getAIClient();

  // Build inline requests for all prompts across all groups
  const inlineRequests = groups.flatMap(group =>
    group.items.map((item, itemIndex) => ({
      key: `g${group.id}_i${itemIndex}_${item.name.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}`,
      request: {
        contents: [{
          parts: [{ text: buildEnhancedPrompt(item.prompt) }],
          role: 'user'
        }],
        generation_config: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: {
            aspectRatio: "16:9",
            imageSize: imageSize
          }
        }
      }
    }))
  );

  const totalRequests = inlineRequests.length;
  const dateStr = new Date().toISOString().split('T')[0];
  const displayName = `objects-gen-${dateStr}-${totalRequests}imgs-${imageSize}`;

  const response = await ai.batches.create({
    model: model,
    src: inlineRequests,
    config: {
      displayName: displayName,
    }
  });

  return {
    name: response.name || '',
    displayName: displayName,
    state: (response.state as BatchJobState) || 'JOB_STATE_PENDING',
    totalRequests: totalRequests,
    completedRequests: 0,
    failedRequests: 0,
    createdAt: new Date().toISOString(),
    model: model,
    resolution: imageSize,
    groups: groups,
  };
};

/**
 * Generates a single reference image for one prompt (Pass 1 of high-coherence).
 * Returns the base64 image data.
 */
const generateReferenceImage = async (
  prompt: string,
  model: ImageModel
): Promise<{ base64: string; mimeType: string }> => {
  const ai = getAIClient();
  const refPrompt = buildReferencePrompt(prompt);

  const response = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [{ text: refPrompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: "1K"
      }
    }
  });

  const image = extractImageFromResponse(response);
  if (!image) throw new Error("Failed to generate reference image");

  const base64 = image.split(',')[1];
  const mimeType = image.split(';')[0].split(':')[1] || 'image/png';
  return { base64, mimeType };
};

/**
 * Creates a HIGH COHERENCE batch job:
 * 1. Pre-generates reference images for each prompt in real-time (Pass 1)
 * 2. Submits a batch with each reference image attached (Pass 2 at -50%)
 *
 * @param onRefProgress - Callback for reference image generation progress
 */
export const createHighCoherenceBatchJob = async (
  groups: PromptGroup[],
  imageSize: ImageSize,
  model: ImageModel,
  onRefProgress?: (current: number, total: number, itemName: string) => void
): Promise<BatchJob> => {
  const ai = getAIClient();

  // Count total items
  const totalItems = groups.reduce((acc, g) => acc + g.items.length, 0);
  let processed = 0;

  // PASS 1: Generate all reference images in real-time
  const refImages: Map<string, { base64: string; mimeType: string }> = new Map();

  for (const group of groups) {
    for (let i = 0; i < group.items.length; i++) {
      const item = group.items[i];
      const key = `g${group.id}_i${i}_${item.name.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}`;

      processed++;
      onRefProgress?.(processed, totalItems, item.name);

      let attempts = 0;
      const maxAttempts = 3;

      while (attempts < maxAttempts) {
        try {
          const ref = await generateReferenceImage(item.prompt, model);
          refImages.set(key, ref);
          break;
        } catch (err) {
          attempts++;
          console.warn(`Reference image attempt ${attempts} failed for ${item.name}`, err);
          if (attempts >= maxAttempts) {
            console.error(`Skipping reference for ${item.name} — will use text-only prompt in batch`);
          } else {
            await new Promise(r => setTimeout(r, 2000 * attempts));
          }
        }
      }

      // Small delay between generations to avoid rate limits
      if (processed < totalItems) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }

  // PASS 2: Create batch requests with reference images attached
  const inlineRequests = groups.flatMap(group =>
    group.items.map((item, itemIndex) => {
      const key = `g${group.id}_i${itemIndex}_${item.name.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}`;
      const ref = refImages.get(key);

      // Build the request parts — with or without reference image
      const parts: any[] = [];

      if (ref) {
        // High coherence: reference image + turnaround prompt
        parts.push({
          inlineData: {
            data: ref.base64,
            mimeType: ref.mimeType,
          }
        });
        parts.push({ text: buildTurnaroundFromRefPrompt(item.prompt) });
      } else {
        // Fallback: text-only enhanced prompt
        parts.push({ text: buildEnhancedPrompt(item.prompt) });
      }

      return {
        key,
        request: {
          contents: [{
            parts,
            role: 'user'
          }],
          generation_config: {
            responseModalities: ["TEXT", "IMAGE"],
            imageConfig: {
              aspectRatio: "16:9",
              imageSize: imageSize
            }
          }
        }
      };
    })
  );

  const totalRequests = inlineRequests.length;
  const dateStr = new Date().toISOString().split('T')[0];
  const displayName = `objects-HC-${dateStr}-${totalRequests}imgs-${imageSize}`;

  const response = await ai.batches.create({
    model: model,
    src: inlineRequests,
    config: {
      displayName: displayName,
    }
  });

  return {
    name: response.name || '',
    displayName: displayName,
    state: (response.state as BatchJobState) || 'JOB_STATE_PENDING',
    totalRequests: totalRequests,
    completedRequests: 0,
    failedRequests: 0,
    createdAt: new Date().toISOString(),
    model: model,
    resolution: imageSize,
    groups: groups,
  };
};

/**
 * Polls the status of a batch job.
 */
export const getBatchJobStatus = async (batchName: string): Promise<{
  state: BatchJobState;
  completedRequests: number;
  failedRequests: number;
}> => {
  const ai = getAIClient();
  const job = await ai.batches.get({ name: batchName });

  return {
    state: (job.state as BatchJobState) || 'JOB_STATE_PENDING',
    completedRequests: (job as any).completedRequestCount || 0,
    failedRequests: (job as any).failedRequestCount || 0,
  };
};

/**
 * Retrieves the results of a completed batch job.
 * Returns a map of request key -> base64 image data.
 */
export const getBatchJobResults = async (batchName: string): Promise<Map<string, string>> => {
  const ai = getAIClient();
  const job = await ai.batches.get({ name: batchName });
  const results = new Map<string, string>();

  // The batch response contains inlined results in the destination
  const dest = (job as any).dest?.inlinedResponses;
  if (dest && Array.isArray(dest)) {
    for (const entry of dest) {
      const key = entry.key || '';
      const response = entry.response;
      if (response?.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            const base64 = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            results.set(key, base64);
            break;
          }
        }
      }
    }
  }

  return results;
};

/**
 * Cancels a running batch job.
 */
export const cancelBatchJob = async (batchName: string): Promise<void> => {
  const ai = getAIClient();
  await ai.batches.cancel({ name: batchName });
};

/**
 * Lists all batch jobs.
 */
export const listBatchJobs = async (): Promise<any[]> => {
  const ai = getAIClient();
  const response = await ai.batches.list();
  const jobs: any[] = [];
  for await (const job of response) {
    jobs.push(job);
  }
  return jobs;
};

/**
 * Polls a batch job until completion or failure.
 * Calls onProgress with updates.
 */
export const pollBatchJob = async (
  batchName: string,
  onProgress: (state: BatchJobState, completed: number, failed: number) => void,
  intervalMs: number = 15000
): Promise<Map<string, string>> => {
  return new Promise((resolve, reject) => {
    const check = async () => {
      try {
        const status = await getBatchJobStatus(batchName);
        onProgress(status.state, status.completedRequests, status.failedRequests);

        if (status.state === 'JOB_STATE_SUCCEEDED') {
          const results = await getBatchJobResults(batchName);
          resolve(results);
          return;
        }

        if (status.state === 'JOB_STATE_FAILED' || status.state === 'JOB_STATE_CANCELLED') {
          reject(new Error(`Batch job ${status.state}: ${batchName}`));
          return;
        }

        // Still running, check again
        setTimeout(check, intervalMs);
      } catch (err) {
        reject(err);
      }
    };

    check();
  });
};
