export type ImageSize = '512px' | '1K' | '2K' | '4K';
export type ImageModel = 'gemini-3.1-flash-image-preview' | 'gemini-3-pro-image-preview';
export type GenerationMode = 'realtime' | 'batch';
export type GenerationBackend = 'gemini' | 'comfyui';
export type ComfyUIModelPreset = 'flux2-multiangle' | 'sd3-mvadapter' | 'qwen-image-edit';

export interface CostEstimation {
  perImage: number;
  total: number;
  currency: string;
  batchPerImage?: number;
  batchTotal?: number;
}

export interface PromptItem {
  name: string;   // Court résumé ou titre du prompt
  prompt: string; // Le prompt complet
  dimensions?: string; // Dimensions extraites (ex: 290 x 105 x 65)
}

export interface PromptGroup {
  id: number;
  name: string;   // Nom de la section ou du groupe
  items: PromptItem[];
}

export interface GeneratedImage {
  groupId: number;
  itemId: number;
  prompt: string;
  base64: string;
  resolution: ImageSize;
}

export interface BatchJob {
  name: string;           // Batch job ID from Google
  displayName: string;    // Human-readable name
  state: BatchJobState;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  createdAt: string;
  model: ImageModel;
  resolution: ImageSize;
  groups: PromptGroup[];
}

export type BatchJobState =
  | 'JOB_STATE_PENDING'
  | 'JOB_STATE_SUCCEEDED'
  | 'JOB_STATE_FAILED'
  | 'JOB_STATE_CANCELLED'
  | 'JOB_STATE_RUNNING';

export enum AppState {
  IDLE = 'IDLE',
  ANALYZING = 'ANALYZING',
  SELECTING = 'SELECTING',
  GENERATING = 'GENERATING',
  GENERATING_ALL = 'GENERATING_ALL',
  FINISHED = 'FINISHED',
  FINISHED_ALL = 'FINISHED_ALL',
  BATCH_SUBMITTED = 'BATCH_SUBMITTED',
  BATCH_MONITORING = 'BATCH_MONITORING',
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    pdfjsLib: any;
    JSZip: any;
    jspdf: any;
    aistudio?: AIStudio;
  }
}
