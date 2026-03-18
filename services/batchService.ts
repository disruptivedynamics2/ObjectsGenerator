import { GoogleGenAI } from "@google/genai";
import { PromptGroup, ImageSize, ImageModel, BatchJob, BatchJobState } from '../types';
import { buildEnhancedPrompt } from './geminiService';

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Creates a batch job for image generation with 50% cost reduction.
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
