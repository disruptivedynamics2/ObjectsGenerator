/**
 * ComfyUI integration service.
 * Connects to a local ComfyUI instance via its REST/WebSocket API.
 *
 * Supported model presets:
 * 1. Flux 2 + Multi-Angles LoRA v2  — best for photorealistic single-pass 3-view
 * 2. SDXL + MV-Adapter              — purpose-built multi-view (front/right/back)
 * 3. Qwen-Image-Edit                — reference image editing for high-coherence pass 2
 */

import { ImageSize, ComfyUIModelPreset } from '../types';

// ═══════════════════════════════════════════════════════
// CONNECTION
// ═══════════════════════════════════════════════════════

const DEFAULT_COMFYUI_URL = 'http://127.0.0.1:8188';
let comfyuiUrl = DEFAULT_COMFYUI_URL;

export const setComfyUIUrl = (url: string) => { comfyuiUrl = url; };
export const getComfyUIUrl = () => comfyuiUrl;

export const isComfyUIAvailable = async (): Promise<boolean> => {
  try {
    const r = await fetch(`${comfyuiUrl}/system_stats`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
};

export const getAvailableModels = async (): Promise<string[]> => {
  try {
    const r = await fetch(`${comfyuiUrl}/object_info/CheckpointLoaderSimple`);
    if (!r.ok) return [];
    const d = await r.json();
    return d?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
  } catch { return []; }
};

export const getAvailableLoRAs = async (): Promise<string[]> => {
  try {
    const r = await fetch(`${comfyuiUrl}/object_info/LoraLoader`);
    if (!r.ok) return [];
    const d = await r.json();
    return d?.LoraLoader?.input?.required?.lora_name?.[0] || [];
  } catch { return []; }
};

// ═══════════════════════════════════════════════════════
// IMAGE UPLOAD / DOWNLOAD
// ═══════════════════════════════════════════════════════

export const uploadImageToComfyUI = async (base64Image: string, filename: string): Promise<string> => {
  const base64Content = base64Image.split(',')[1];
  const mimeType = base64Image.split(';')[0].split(':')[1] || 'image/png';
  const byteChars = atob(base64Content);
  const byteArray = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteArray[i] = byteChars.charCodeAt(i);
  const blob = new Blob([byteArray], { type: mimeType });
  const formData = new FormData();
  formData.append('image', blob, filename);
  formData.append('overwrite', 'true');
  const r = await fetch(`${comfyuiUrl}/upload/image`, { method: 'POST', body: formData });
  if (!r.ok) throw new Error(`ComfyUI upload failed: ${r.statusText}`);
  return (await r.json()).name;
};

const fetchGeneratedImage = async (promptId: string): Promise<string> => {
  const r = await fetch(`${comfyuiUrl}/history/${promptId}`);
  if (!r.ok) throw new Error('Failed to fetch ComfyUI history');
  const data = await r.json();
  const outputs = data[promptId]?.outputs;
  if (!outputs) throw new Error('No outputs in ComfyUI history');

  for (const nodeId of Object.keys(outputs)) {
    const nodeOutput = outputs[nodeId];
    if (nodeOutput.images?.length > 0) {
      const img = nodeOutput.images[0];
      const imgR = await fetch(
        `${comfyuiUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`
      );
      if (!imgR.ok) throw new Error('Failed to fetch image from ComfyUI');
      const blob = await imgR.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('Failed to read image'));
        reader.readAsDataURL(blob);
      });
    }
  }
  throw new Error('No image found in ComfyUI output');
};

// ═══════════════════════════════════════════════════════
// QUEUE & WAIT
// ═══════════════════════════════════════════════════════

export const queueAndWaitForImage = async (
  workflow: Record<string, any>,
  onProgress?: (value: number, max: number) => void
): Promise<string> => {
  const clientId = crypto.randomUUID();
  const ws = new WebSocket(`ws://${new URL(comfyuiUrl).host}/ws?clientId=${clientId}`);

  return new Promise((resolve, reject) => {
    let promptId = '';
    const timeoutId = setTimeout(() => { ws.close(); reject(new Error('ComfyUI timeout (5 min)')); }, 300000);

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'progress' && msg.data?.prompt_id === promptId) {
          onProgress?.(msg.data.value, msg.data.max);
        }
        if (msg.type === 'executing' && msg.data?.prompt_id === promptId && msg.data?.node === null) {
          clearTimeout(timeoutId); ws.close();
          try { resolve(await fetchGeneratedImage(promptId)); }
          catch (err) { reject(err); }
        }
      } catch { /* ignore non-JSON */ }
    };

    ws.onerror = () => { clearTimeout(timeoutId); reject(new Error('ComfyUI WebSocket failed. Is ComfyUI running?')); };

    ws.onopen = async () => {
      try {
        const r = await fetch(`${comfyuiUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: workflow, client_id: clientId }),
        });
        if (!r.ok) { clearTimeout(timeoutId); ws.close(); reject(new Error(`ComfyUI rejected workflow: ${await r.text()}`)); return; }
        promptId = (await r.json()).prompt_id;
      } catch (err: any) { clearTimeout(timeoutId); ws.close(); reject(new Error(`Queue failed: ${err.message}`)); }
    };
  });
};

// ═══════════════════════════════════════════════════════
// MODEL PRESET CONFIGS
// ═══════════════════════════════════════════════════════

export interface ModelPresetInfo {
  id: ComfyUIModelPreset;
  name: string;
  description: string;
  requiredModels: { name: string; path: string; url: string }[];
  requiredNodes: { name: string; repo: string }[];
}

export const MODEL_PRESETS: ModelPresetInfo[] = [
  {
    id: 'flux2-multiangle',
    name: 'Flux 2 + Multi-Angles LoRA',
    description: 'Meilleure qualité photoréaliste. Génère les 3 vues via un LoRA entraîné spécifiquement sur les planches multi-angles.',
    requiredModels: [
      { name: 'flux1-dev-fp8.safetensors', path: 'models/checkpoints/', url: 'https://huggingface.co/Comfy-Org/flux1-dev/blob/main/flux1-dev-fp8.safetensors' },
      { name: 'Flux-2-Multi-Angles-LoRA-v2.safetensors', path: 'models/loras/', url: 'https://huggingface.co/lovis93/Flux-2-Multi-Angles-LoRA-v2' },
    ],
    requiredNodes: [],
  },
  {
    id: 'sd3-mvadapter',
    name: 'SDXL + MV-Adapter',
    description: 'Multi-view dédié. Génère front/right/back avec cohérence structurelle garantie par MV-Adapter.',
    requiredModels: [
      { name: 'sd_xl_base_1.0.safetensors', path: 'models/checkpoints/', url: 'https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0' },
    ],
    requiredNodes: [
      { name: 'ComfyUI-MVAdapter', repo: 'https://github.com/huanngzh/ComfyUI-MVAdapter' },
    ],
  },
  {
    id: 'qwen-image-edit',
    name: 'Qwen-Image-Edit',
    description: 'Édition guidée par référence. Idéal en pass 2 haute cohérence : prend une image de référence et génère les vues en conservant le design exact.',
    requiredModels: [
      { name: 'Qwen-Image-Edit (auto-download)', path: 'models/', url: 'https://huggingface.co/Qwen/Qwen-Image-Edit-2511' },
    ],
    requiredNodes: [
      { name: 'Comfyui-QwenEditUtils ou support natif', repo: 'https://github.com/lrzjason/Comfyui-QwenEditUtils' },
    ],
  },
];

// ═══════════════════════════════════════════════════════
// WORKFLOW BUILDERS PER PRESET
// ═══════════════════════════════════════════════════════

const NEG_PROMPT = 'blurry, low quality, distorted, deformed, ugly, watermark, text, logo, labels, annotations, different objects between views, inconsistent, extra legs, missing parts';

/**
 * Resolution mapping for 16:9 output.
 */
const getResolution = (imageSize: ImageSize): { width: number; height: number } => {
  const map: Record<ImageSize, { width: number; height: number }> = {
    '512px': { width: 912, height: 512 },
    '1K': { width: 1344, height: 768 },
    '2K': { width: 1920, height: 1080 },
    '4K': { width: 2560, height: 1440 },
  };
  return map[imageSize] || map['1K'];
};

/**
 * Flux 2 + Multi-Angles LoRA workflow.
 */
const buildFlux2Workflow = (prompt: string, imageSize: ImageSize): Record<string, any> => {
  const res = getResolution(imageSize);
  const seed = Math.floor(Math.random() * 2147483647);

  const turnaroundPrompt = `multi-angle product turnaround sheet, three views side by side: front view, right side view, rear view. ${prompt}. Pure white background, soft studio lighting, photorealistic, 8K, sharp focus, professional catalog. Identical object in all views, consistent proportions, same materials and colors.`;

  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' },
    },
    '10': {
      class_type: 'LoraLoader',
      inputs: {
        lora_name: 'Flux-2-Multi-Angles-LoRA-v2.safetensors',
        strength_model: 0.85,
        strength_clip: 0.85,
        model: ['1', 0],
        clip: ['1', 1],
      },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: turnaroundPrompt, clip: ['10', 1] },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: NEG_PROMPT, clip: ['10', 1] },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: res.width, height: res.height, batch_size: 1 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed, steps: 28, cfg: 3.5, sampler_name: 'euler', scheduler: 'normal', denoise: 1,
        model: ['10', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'ObjGen_Flux', images: ['6', 0] },
    },
  };
};

/**
 * SDXL + MV-Adapter workflow.
 * Uses the MVAdapter custom nodes to generate 3 consistent views.
 */
const buildMVAdapterWorkflow = (prompt: string, imageSize: ImageSize): Record<string, any> => {
  const res = getResolution(imageSize);
  const seed = Math.floor(Math.random() * 2147483647);

  // MV-Adapter uses specific node types from ComfyUI-MVAdapter
  // This is the text-to-multiview (t2mv) workflow structure
  return {
    '1': {
      class_type: 'CheckpointLoaderSimple',
      inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' },
    },
    '20': {
      class_type: 'MVAdapterModelMakeup',
      inputs: {
        mv_adapter_name: 'mvadapter_sdxl_ldm.safetensors',
        num_views: 3,
        model: ['1', 0],
      },
    },
    '21': {
      class_type: 'MVAdapterSchedulerMakeup',
      inputs: {
        guidance_scale: 7.0,
        num_views: 3,
        view_ids: '0,4,2', // front, right, back
        model: ['20', 0],
      },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: { text: `${prompt}. Photorealistic product visualization, 8K, white background, studio lighting.`, clip: ['1', 1] },
    },
    '3': {
      class_type: 'CLIPTextEncode',
      inputs: { text: NEG_PROMPT, clip: ['1', 1] },
    },
    '4': {
      class_type: 'EmptyLatentImage',
      inputs: { width: res.width, height: Math.round(res.height / 3), batch_size: 3 },
    },
    '5': {
      class_type: 'KSampler',
      inputs: {
        seed, steps: 30, cfg: 7, sampler_name: 'euler', scheduler: 'normal', denoise: 1,
        model: ['21', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
      },
    },
    '6': {
      class_type: 'VAEDecode',
      inputs: { samples: ['5', 0], vae: ['1', 2] },
    },
    // Stitch the 3 views horizontally
    '25': {
      class_type: 'ImageBatch',
      inputs: { images: ['6', 0] },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'ObjGen_MVAdapter', images: ['6', 0] },
    },
  };
};

/**
 * Qwen-Image-Edit workflow (for high-coherence pass 2).
 * Takes a reference image and an editing instruction to produce the 3-view turnaround.
 */
const buildQwenEditWorkflow = (referenceFilename: string, prompt: string, imageSize: ImageSize): Record<string, any> => {
  const res = getResolution(imageSize);

  const editInstruction = `Transform this single product image into a technical reference sheet showing the EXACT SAME object from 3 angles side by side in one horizontal image: front view (left), right side view (center), rear view (right). Keep every detail identical: same shape, same materials, same colors, same number of legs/handles/drawers. Pure white background, photorealistic rendering, professional catalog quality.`;

  return {
    '1': {
      class_type: 'LoadImage',
      inputs: { image: referenceFilename },
    },
    '2': {
      class_type: 'QwenImageEdit',
      inputs: {
        image: ['1', 0],
        instruction: editInstruction,
        width: res.width,
        height: res.height,
        steps: 30,
        seed: Math.floor(Math.random() * 2147483647),
      },
    },
    '7': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: 'ObjGen_QwenEdit', images: ['2', 0] },
    },
  };
};

/**
 * Build a reference image workflow (for high-coherence pass 1, any preset).
 */
const buildReferenceWorkflow = (prompt: string, preset: ComfyUIModelPreset): Record<string, any> => {
  const refPrompt = `Single photorealistic product photograph, front 3/4 view slightly angled 30 degrees. ${prompt}. Pure white background, soft studio lighting, 8K, sharp focus. Show every structural detail: legs, handles, drawers, cushions, edges, hardware. 100% original design.`;

  if (preset === 'flux2-multiangle') {
    return {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'flux1-dev-fp8.safetensors' } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: refPrompt, clip: ['1', 1] } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: NEG_PROMPT, clip: ['1', 1] } },
      '4': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
      '5': { class_type: 'KSampler', inputs: {
        seed: Math.floor(Math.random() * 2147483647), steps: 28, cfg: 3.5,
        sampler_name: 'euler', scheduler: 'normal', denoise: 1,
        model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
      }},
      '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'ObjGen_Ref', images: ['6', 0] } },
    };
  }

  // Default: SDXL base for reference
  return {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'sd_xl_base_1.0.safetensors' } },
    '2': { class_type: 'CLIPTextEncode', inputs: { text: refPrompt, clip: ['1', 1] } },
    '3': { class_type: 'CLIPTextEncode', inputs: { text: NEG_PROMPT, clip: ['1', 1] } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: 1024, height: 1024, batch_size: 1 } },
    '5': { class_type: 'KSampler', inputs: {
      seed: Math.floor(Math.random() * 2147483647), steps: 25, cfg: 7,
      sampler_name: 'euler', scheduler: 'normal', denoise: 1,
      model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
    }},
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
    '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'ObjGen_Ref', images: ['6', 0] } },
  };
};

// ═══════════════════════════════════════════════════════
// HIGH-LEVEL GENERATION
// ═══════════════════════════════════════════════════════

/**
 * Generates a 3-view image using ComfyUI with the selected preset.
 * Supports standard and high-coherence modes.
 */
export const generateWithComfyUI = async (
  prompt: string,
  imageSize: ImageSize = '1K',
  preset: ComfyUIModelPreset = 'flux2-multiangle',
  highCoherence: boolean = false,
  onProgress?: (step: string, value: number, max: number) => void
): Promise<string> => {

  if (!highCoherence) {
    // ── Standard mode: single-pass ──
    let workflow: Record<string, any>;

    switch (preset) {
      case 'flux2-multiangle':
        workflow = buildFlux2Workflow(prompt, imageSize);
        break;
      case 'sd3-mvadapter':
        workflow = buildMVAdapterWorkflow(prompt, imageSize);
        break;
      case 'qwen-image-edit':
        // Qwen needs a reference — fall back to Flux for standard mode
        workflow = buildFlux2Workflow(prompt, imageSize);
        break;
      default:
        workflow = buildFlux2Workflow(prompt, imageSize);
    }

    onProgress?.('Génération locale...', 0, 100);
    return await queueAndWaitForImage(workflow, (v, m) => onProgress?.('Génération locale...', v, m));
  }

  // ── High Coherence: 2-pass ──

  // Pass 1: Generate reference image
  onProgress?.('Pass 1 — Référence...', 0, 100);
  const refWorkflow = buildReferenceWorkflow(prompt, preset);
  const refImage = await queueAndWaitForImage(refWorkflow, (v, m) => onProgress?.('Pass 1 — Référence...', v, m));

  // Upload reference to ComfyUI
  const refFilename = await uploadImageToComfyUI(refImage, `ref_${Date.now()}.png`);

  // Pass 2: Generate 3-view from reference
  onProgress?.('Pass 2 — 3 vues...', 0, 100);

  let turnaroundWorkflow: Record<string, any>;

  if (preset === 'qwen-image-edit') {
    // Qwen excels at reference-based editing
    turnaroundWorkflow = buildQwenEditWorkflow(refFilename, prompt, imageSize);
  } else {
    // For Flux/SDXL: img2img from the reference
    const res = getResolution(imageSize);
    const turnaroundPrompt = `multi-angle product turnaround sheet, three views side by side: front view, right side view, rear view. ${prompt}. Pure white background, photorealistic, 8K. Same identical object in all 3 views.`;

    turnaroundWorkflow = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: preset === 'flux2-multiangle' ? 'flux1-dev-fp8.safetensors' : 'sd_xl_base_1.0.safetensors' } },
      '8': { class_type: 'LoadImage', inputs: { image: refFilename } },
      '9': { class_type: 'VAEEncode', inputs: { pixels: ['8', 0], vae: ['1', 2] } },
      '2': { class_type: 'CLIPTextEncode', inputs: { text: turnaroundPrompt, clip: ['1', 1] } },
      '3': { class_type: 'CLIPTextEncode', inputs: { text: NEG_PROMPT, clip: ['1', 1] } },
      '5': { class_type: 'KSampler', inputs: {
        seed: Math.floor(Math.random() * 2147483647),
        steps: preset === 'flux2-multiangle' ? 28 : 25,
        cfg: preset === 'flux2-multiangle' ? 3.5 : 7,
        sampler_name: 'euler', scheduler: 'normal', denoise: 0.75,
        model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['9', 0],
      }},
      '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
      '7': { class_type: 'SaveImage', inputs: { filename_prefix: 'ObjGen_HC', images: ['6', 0] } },
    };

    // Add LoRA for Flux
    if (preset === 'flux2-multiangle') {
      turnaroundWorkflow['10'] = {
        class_type: 'LoraLoader',
        inputs: {
          lora_name: 'Flux-2-Multi-Angles-LoRA-v2.safetensors',
          strength_model: 0.85, strength_clip: 0.85,
          model: ['1', 0], clip: ['1', 1],
        },
      };
      turnaroundWorkflow['5'].inputs.model = ['10', 0];
      turnaroundWorkflow['2'].inputs.clip = ['10', 1];
      turnaroundWorkflow['3'].inputs.clip = ['10', 1];
    }
  }

  return await queueAndWaitForImage(turnaroundWorkflow, (v, m) => onProgress?.('Pass 2 — 3 vues...', v, m));
};
