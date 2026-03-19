/**
 * ComfyUI integration service.
 * Connects to a local ComfyUI instance via its REST/WebSocket API.
 *
 * Uses the Qwen-Image-Edit-2511 Multiple Angles workflow:
 * - Generates individual views at specific camera angles from a reference image
 * - Each view is a separate KSampler pass with QwenMultiangleCameraNode
 * - Results are fetched individually and can be stitched into a single 3-view image
 *
 * Required models (auto-downloaded by the workflow):
 * - Qwen-Image-Edit-2511-FP8_e4m3fn.safetensors (diffusion model)
 * - qwen_2.5_vl_7b_fp8_scaled.safetensors (CLIP)
 * - qwen_image_vae.safetensors (VAE)
 * - qwen-image-edit-2511-multiple-angles-lora.safetensors (LoRA)
 * - Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors (LoRA)
 *
 * Required custom nodes:
 * - ComfyUI-qwenmultiangle (jtydhr88/ComfyUI-qwenmultiangle)
 * - FluxKontextImageScale (comfy-core)
 * - CFGNorm, ModelSamplingAuraFlow (comfy-core)
 * - FluxKontextMultiReferenceLatentMethod (comfy-core)
 */

import { ImageSize } from '../types';

// ═══════════════════════════════════════════════════════
// CONNECTION
// ═══════════════════════════════════════════════════════

const DEFAULT_COMFYUI_URL = 'http://127.0.0.1:8188';
let comfyuiUrl = DEFAULT_COMFYUI_URL;

export const setComfyUIUrl = (url: string) => { comfyuiUrl = url; };
export const getComfyUIUrl = () => comfyuiUrl;

/**
 * Cleans a full prompt to extract ONLY the physical object description.
 * Removes all rendering instructions, view layout instructions, dimensions text,
 * and anything that ComfyUI/Qwen would try to draw as text in the image.
 *
 * Input example:
 * "Génère une planche produit montrant un canapé 3 places, revêtement bouclette ivoire,
 *  4 pieds en chêne clair... Important : crée un design 100% original... Affiche l'objet
 *  sous 3 vues distinctes... Longueur (cm) x Profondeur (cm) x Hauteur (cm) : 230 x 95 x 82."
 *
 * Output:
 * "un canapé 3 places, revêtement bouclette ivoire, 4 pieds en chêne clair..."
 */
export const cleanPromptForComfyUI = (prompt: string): string => {
  let cleaned = prompt;

  // Remove the opening "Génère une planche produit montrant" prefix
  cleaned = cleaned.replace(/^G[ée]n[èe]re une planche produit montrant\s*/i, '');

  // Remove everything after "Important :" (the rendering/legal clause)
  const importantIdx = cleaned.indexOf('Important');
  if (importantIdx > 20) {
    cleaned = cleaned.substring(0, importantIdx).trim();
  }

  // Remove dimensions line if it somehow survived
  cleaned = cleaned.replace(/Sous les 3 vues.*$/i, '');
  cleaned = cleaned.replace(/Longueur\s*\(cm\).*$/i, '');
  cleaned = cleaned.replace(/Long\s*\(cm\).*$/i, '');
  cleaned = cleaned.replace(/\d+\s*x\s*\d+\s*x\s*\d+\s*(cm)?\.?\s*$/i, '');

  // Remove view instructions
  cleaned = cleaned.replace(/Affiche l'objet.*$/i, '');
  cleaned = cleaned.replace(/sous\s*3\s*vues\s*distinctes.*$/i, '');
  cleaned = cleaned.replace(/de face,?\s*de côté.*$/i, '');
  cleaned = cleaned.replace(/côte à côte.*$/i, '');
  cleaned = cleaned.replace(/rendu photoréaliste.*$/i, '');
  cleaned = cleaned.replace(/éclairage studio.*$/i, '');
  cleaned = cleaned.replace(/fond blanc.*$/i, '');
  cleaned = cleaned.replace(/sans ombres.*$/i, '');
  cleaned = cleaned.replace(/sans logo.*$/i, '');
  cleaned = cleaned.replace(/sans humains.*$/i, '');
  cleaned = cleaned.replace(/sans éléments décoratifs.*$/i, '');

  // Remove trailing punctuation and whitespace
  cleaned = cleaned.replace(/[,.\s]+$/, '').trim();

  // If cleaning removed too much, fall back to original but strip dimensions
  if (cleaned.length < 20) {
    cleaned = prompt
      .replace(/Important\s*:.*$/is, '')
      .replace(/Longueur.*$/i, '')
      .replace(/\d+\s*x\s*\d+\s*x\s*\d+.*$/i, '')
      .trim();
  }

  return cleaned;
};

export const isComfyUIAvailable = async (): Promise<boolean> => {
  try {
    const r = await fetch(`${comfyuiUrl}/system_stats`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
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

const fetchAllGeneratedImages = async (promptId: string): Promise<string[]> => {
  const r = await fetch(`${comfyuiUrl}/history/${promptId}`);
  if (!r.ok) throw new Error('Failed to fetch ComfyUI history');
  const data = await r.json();
  const outputs = data[promptId]?.outputs;
  if (!outputs) throw new Error('No outputs in ComfyUI history');

  const images: string[] = [];

  // Collect images from all SaveImage nodes, in order of node ID
  const sortedNodeIds = Object.keys(outputs).sort();
  for (const nodeId of sortedNodeIds) {
    const nodeOutput = outputs[nodeId];
    if (nodeOutput.images?.length > 0) {
      for (const img of nodeOutput.images) {
        const imgR = await fetch(
          `${comfyuiUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`
        );
        if (!imgR.ok) continue;
        const blob = await imgR.blob();
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read image'));
          reader.readAsDataURL(blob);
        });
        images.push(base64);
      }
    }
  }

  return images;
};

// ═══════════════════════════════════════════════════════
// QUEUE & WAIT
// ═══════════════════════════════════════════════════════

const queueAndWait = async (
  workflow: Record<string, any>,
  onProgress?: (value: number, max: number) => void
): Promise<string[]> => {
  const clientId = crypto.randomUUID();
  const ws = new WebSocket(`ws://${new URL(comfyuiUrl).host}/ws?clientId=${clientId}`);

  return new Promise((resolve, reject) => {
    let promptId = '';
    const timeoutId = setTimeout(() => { ws.close(); reject(new Error('ComfyUI timeout (10 min)')); }, 600000);

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'progress' && msg.data?.prompt_id === promptId) {
          onProgress?.(msg.data.value, msg.data.max);
        }
        if (msg.type === 'executing' && msg.data?.prompt_id === promptId && msg.data?.node === null) {
          clearTimeout(timeoutId); ws.close();
          try { resolve(await fetchAllGeneratedImages(promptId)); }
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
// STITCH IMAGES INTO A SINGLE 3-VIEW IMAGE
// ═══════════════════════════════════════════════════════

/**
 * Takes 3 individual view images and stitches them side by side into one wide image.
 */
const stitchImages = async (images: string[]): Promise<string> => {
  // Load all images
  const loadImage = (src: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image for stitching'));
      img.src = src;
    });
  };

  const imgs = await Promise.all(images.map(loadImage));

  // Calculate canvas dimensions
  const maxHeight = Math.max(...imgs.map(i => i.height));
  const totalWidth = imgs.reduce((sum, i) => sum + i.width, 0);

  const canvas = document.createElement('canvas');
  canvas.width = totalWidth;
  canvas.height = maxHeight;
  const ctx = canvas.getContext('2d')!;

  // White background
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, totalWidth, maxHeight);

  // Draw each image side by side
  let x = 0;
  for (const img of imgs) {
    // Center vertically
    const y = (maxHeight - img.height) / 2;
    ctx.drawImage(img, x, y);
    x += img.width;
  }

  // Draw thin gray dividers
  ctx.strokeStyle = '#E0E0E0';
  ctx.lineWidth = 2;
  let divX = imgs[0].width;
  for (let i = 1; i < imgs.length; i++) {
    ctx.beginPath();
    ctx.moveTo(divX, 0);
    ctx.lineTo(divX, maxHeight);
    ctx.stroke();
    divX += imgs[i].width;
  }

  return canvas.toDataURL('image/png');
};

// ═══════════════════════════════════════════════════════
// WORKFLOW BUILDER — QWEN MULTIANGLE
// ═══════════════════════════════════════════════════════

interface ViewConfig {
  horizontal_angle: number;
  vertical_angle: number;
  zoom: number;
}

/**
 * Builds one "view generation chain" for the Qwen Multiangle workflow.
 * Each view needs: QwenMultiangleCameraNode → TextEncodeQwenImageEditPlus (neg)
 *   → FluxKontextMultiReferenceLatentMethod (neg) → TextEncodeQwenImageEditPlus (pos)
 *   → FluxKontextMultiReferenceLatentMethod (pos) → ModelSamplingAuraFlow → CFGNorm
 *   → VAEEncode → KSampler → VAEDecode → SaveImage
 */
const buildViewChain = (
  viewIndex: number,
  view: ViewConfig,
  imageNodeId: string,
  seed: number,
  prefix: string
): Record<string, any> => {
  // Use unique prefixes per view to avoid node ID collisions
  const p = `v${viewIndex}`;

  return {
    // Camera angle → generates the prompt string
    [`${p}_cam`]: {
      inputs: {
        horizontal_angle: view.horizontal_angle,
        vertical_angle: view.vertical_angle,
        zoom: view.zoom,
        default_prompts: false,
        camera_view: false,
        image: [imageNodeId, 0],
      },
      class_type: 'QwenMultiangleCameraNode',
      _meta: { title: `Camera View ${viewIndex}` },
    },
    // Scale image
    [`${p}_scale`]: {
      inputs: { image: [imageNodeId, 0] },
      class_type: 'FluxKontextImageScale',
      _meta: { title: `Scale ${viewIndex}` },
    },
    // ModelSamplingAuraFlow
    [`${p}_aura`]: {
      inputs: { shift: 3.1, model: ['shared_lora2', 0] },
      class_type: 'ModelSamplingAuraFlow',
      _meta: { title: `AuraFlow ${viewIndex}` },
    },
    // CFGNorm
    [`${p}_cfgnorm`]: {
      inputs: { strength: 1, model: [`${p}_aura`, 0] },
      class_type: 'CFGNorm',
      _meta: { title: `CFGNorm ${viewIndex}` },
    },
    // Negative conditioning
    [`${p}_neg_encode`]: {
      inputs: {
        prompt: 'room, interior, environment, background scene, colored background, gray background, dark background, shadows on background, floor, wall, furniture context, multiple objects, text, watermark, labels, dimensions, annotations, blurry, low quality, distorted',
        speak_and_recognation: { __value__: [false, true] },
        clip: ['shared_clip', 0],
        vae: ['shared_vae', 0],
        image1: [`${p}_scale`, 0],
      },
      class_type: 'TextEncodeQwenImageEditPlus',
      _meta: { title: `Neg Encode ${viewIndex}` },
    },
    [`${p}_neg_ref`]: {
      inputs: {
        reference_latents_method: 'index_timestep_zero',
        conditioning: [`${p}_neg_encode`, 0],
      },
      class_type: 'FluxKontextMultiReferenceLatentMethod',
      _meta: { title: `Neg Ref ${viewIndex}` },
    },
    // Positive conditioning (camera prompt)
    [`${p}_pos_encode`]: {
      inputs: {
        prompt: [`${p}_cam`, 0],
        speak_and_recognation: { __value__: [false, true] },
        clip: ['shared_clip', 0],
        vae: ['shared_vae', 0],
        image1: [`${p}_scale`, 0],
      },
      class_type: 'TextEncodeQwenImageEditPlus',
      _meta: { title: `Pos Encode ${viewIndex}` },
    },
    [`${p}_pos_ref`]: {
      inputs: {
        reference_latents_method: 'index_timestep_zero',
        conditioning: [`${p}_pos_encode`, 0],
      },
      class_type: 'FluxKontextMultiReferenceLatentMethod',
      _meta: { title: `Pos Ref ${viewIndex}` },
    },
    // VAE Encode reference image
    [`${p}_vae_enc`]: {
      inputs: {
        pixels: [`${p}_scale`, 0],
        vae: ['shared_vae', 0],
      },
      class_type: 'VAEEncode',
      _meta: { title: `VAE Encode ${viewIndex}` },
    },
    // KSampler
    [`${p}_sampler`]: {
      inputs: {
        seed: seed + viewIndex,
        steps: 4,
        cfg: 1,
        sampler_name: 'euler',
        scheduler: 'simple',
        denoise: 1,
        model: [`${p}_cfgnorm`, 0],
        positive: [`${p}_pos_ref`, 0],
        negative: [`${p}_neg_ref`, 0],
        latent_image: [`${p}_vae_enc`, 0],
      },
      class_type: 'KSampler',
      _meta: { title: `KSampler ${viewIndex}` },
    },
    // VAE Decode
    [`${p}_decode`]: {
      inputs: {
        samples: [`${p}_sampler`, 0],
        vae: ['shared_vae', 0],
      },
      class_type: 'VAEDecode',
      _meta: { title: `VAE Decode ${viewIndex}` },
    },
    // Save Image
    [`${p}_save`]: {
      inputs: {
        filename_prefix: `${prefix}/${viewIndex}`,
        images: [`${p}_decode`, 0],
      },
      class_type: 'SaveImage',
      _meta: { title: `Save ${viewIndex}` },
    },
  };
};

/**
 * Builds a complete Qwen Multiangle workflow for 3 views.
 */
const buildQwenMultiangleWorkflow = (
  referenceImageFilename: string,
  views: ViewConfig[],
  seed?: number
): Record<string, any> => {
  const s = seed ?? Math.floor(Math.random() * 9999999999999);
  const prefix = `ObjGen_${Date.now()}`;

  // Shared nodes (loaded once, used by all views)
  const workflow: Record<string, any> = {
    // Load reference image
    'shared_image': {
      inputs: { image: referenceImageFilename },
      class_type: 'LoadImage',
      _meta: { title: 'Load Reference Image' },
    },
    // CLIP
    'shared_clip': {
      inputs: {
        clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors',
        type: 'qwen_image',
        device: 'default',
      },
      class_type: 'CLIPLoader',
      _meta: { title: 'Load CLIP' },
    },
    // VAE
    'shared_vae': {
      inputs: { vae_name: 'qwen_image_vae.safetensors' },
      class_type: 'VAELoader',
      _meta: { title: 'Load VAE' },
    },
    // UNET
    'shared_unet': {
      inputs: {
        unet_name: 'Qwen-Image-Edit-2511-FP8_e4m3fn.safetensors',
        weight_dtype: 'default',
      },
      class_type: 'UNETLoader',
      _meta: { title: 'Load Diffusion Model' },
    },
    // LoRA 1: Lightning 4-steps
    'shared_lora1': {
      inputs: {
        lora_name: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors',
        strength_model: 1,
        model: ['shared_unet', 0],
      },
      class_type: 'LoraLoaderModelOnly',
      _meta: { title: 'Load Lightning LoRA' },
    },
    // LoRA 2: Multiple Angles
    'shared_lora2': {
      inputs: {
        lora_name: 'qwen-image-edit-2511-multiple-angles-lora.safetensors',
        strength_model: 1,
        model: ['shared_lora1', 0],
      },
      class_type: 'LoraLoaderModelOnly',
      _meta: { title: 'Load Multi-Angles LoRA' },
    },
  };

  // Add view chains
  for (let i = 0; i < views.length; i++) {
    const chain = buildViewChain(i, views[i], 'shared_image', s, prefix);
    Object.assign(workflow, chain);
  }

  return workflow;
};

// ═══════════════════════════════════════════════════════
// VIEW PRESETS — 6 CUSTOM VIEWS
// ═══════════════════════════════════════════════════════

/** 6 views organized as 2 sets of 3 for the PDF slides */
export const VIEWS_6_CUSTOM: ViewConfig[] = [
  // Slide 1 — 3 views
  { horizontal_angle: 37, vertical_angle: 37, zoom: 5 },    // Vue 1: 3/4 avant haut
  { horizontal_angle: 37, vertical_angle: -22, zoom: 5 },   // Vue 2: 3/4 avant bas
  { horizontal_angle: 217, vertical_angle: 37, zoom: 5 },   // Vue 3: 3/4 arrière haut
  // Slide 2 — 3 views
  { horizontal_angle: 217, vertical_angle: -22, zoom: 5 },  // Vue 4: 3/4 arrière bas
  { horizontal_angle: 90, vertical_angle: 8, zoom: 5 },     // Vue 5: Profil
  { horizontal_angle: 0, vertical_angle: 60, zoom: 5 },     // Vue 6: Dessus incliné (max 60° pour QwenMultiangle)
];

/** Labels for each view (used in PDF) */
export const VIEW_LABELS: string[] = [
  '3/4 AVANT HAUT',
  '3/4 AVANT BAS',
  '3/4 ARRIÈRE HAUT',
  '3/4 ARRIÈRE BAS',
  'PROFIL',
  'DESSUS',
];

// ═══════════════════════════════════════════════════════
// REFERENCE IMAGE GENERATION VIA QWEN (LOCAL, 0€)
// ═══════════════════════════════════════════════════════

/**
 * Builds a Qwen workflow to generate a reference image from a text prompt.
 * Uses Qwen-Image-Edit with a blank/simple starting image and a text description.
 * This is a basic text-to-image through the edit model.
 */
const buildQwenReferenceWorkflow = (
  textPrompt: string,
  seed?: number
): Record<string, any> => {
  const s = seed ?? Math.floor(Math.random() * 9999999999999);

  return {
    // Shared models
    'shared_clip': {
      inputs: { clip_name: 'qwen_2.5_vl_7b_fp8_scaled.safetensors', type: 'qwen_image', device: 'default' },
      class_type: 'CLIPLoader', _meta: { title: 'Load CLIP' },
    },
    'shared_vae': {
      inputs: { vae_name: 'qwen_image_vae.safetensors' },
      class_type: 'VAELoader', _meta: { title: 'Load VAE' },
    },
    'shared_unet': {
      inputs: { unet_name: 'Qwen-Image-Edit-2511-FP8_e4m3fn.safetensors', weight_dtype: 'default' },
      class_type: 'UNETLoader', _meta: { title: 'Load Diffusion Model' },
    },
    'shared_lora1': {
      inputs: { lora_name: 'Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors', strength_model: 1, model: ['shared_unet', 0] },
      class_type: 'LoraLoaderModelOnly', _meta: { title: 'Load Lightning LoRA' },
    },
    // Empty latent (no reference image — pure generation)
    'empty_latent': {
      inputs: { width: 1024, height: 1024, batch_size: 1 },
      class_type: 'EmptyLatentImage', _meta: { title: 'Empty Latent' },
    },
    // ModelSamplingAuraFlow
    'aura': {
      inputs: { shift: 3.1, model: ['shared_lora1', 0] },
      class_type: 'ModelSamplingAuraFlow', _meta: { title: 'AuraFlow' },
    },
    'cfgnorm': {
      inputs: { strength: 1, model: ['aura', 0] },
      class_type: 'CFGNorm', _meta: { title: 'CFGNorm' },
    },
    // Positive prompt
    'pos_encode': {
      inputs: {
        prompt: `Generate a single photorealistic product photograph. ${textPrompt}. Front 3/4 view, slightly angled 30 degrees. Pure white background, soft studio lighting, 8K, sharp focus. Show every structural detail clearly. 100% original design.`,
        speak_and_recognation: { __value__: [false, true] },
        clip: ['shared_clip', 0],
        vae: ['shared_vae', 0],
      },
      class_type: 'TextEncodeQwenImageEditPlus', _meta: { title: 'Positive Prompt' },
    },
    'pos_ref': {
      inputs: { reference_latents_method: 'index_timestep_zero', conditioning: ['pos_encode', 0] },
      class_type: 'FluxKontextMultiReferenceLatentMethod', _meta: { title: 'Pos Ref' },
    },
    // Negative prompt
    'neg_encode': {
      inputs: {
        prompt: 'room, interior, environment, colored background, gray background, dark background, shadows on background, floor, wall, multiple objects, text, watermark, labels, dimensions, blurry, low quality, distorted, deformed, ugly',
        speak_and_recognation: { __value__: [false, true] },
        clip: ['shared_clip', 0],
        vae: ['shared_vae', 0],
      },
      class_type: 'TextEncodeQwenImageEditPlus', _meta: { title: 'Negative Prompt' },
    },
    'neg_ref': {
      inputs: { reference_latents_method: 'index_timestep_zero', conditioning: ['neg_encode', 0] },
      class_type: 'FluxKontextMultiReferenceLatentMethod', _meta: { title: 'Neg Ref' },
    },
    // KSampler
    'sampler': {
      inputs: {
        seed: s, steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1,
        model: ['cfgnorm', 0], positive: ['pos_ref', 0], negative: ['neg_ref', 0], latent_image: ['empty_latent', 0],
      },
      class_type: 'KSampler', _meta: { title: 'KSampler' },
    },
    // VAE Decode
    'decode': {
      inputs: { samples: ['sampler', 0], vae: ['shared_vae', 0] },
      class_type: 'VAEDecode', _meta: { title: 'VAE Decode' },
    },
    // Save
    'save': {
      inputs: { filename_prefix: 'ObjGen_Ref', images: ['decode', 0] },
      class_type: 'SaveImage', _meta: { title: 'Save Reference' },
    },
  };
};

/**
 * Generates a reference image entirely locally using Qwen (0€ cost).
 */
export const generateReferenceWithQwen = async (
  prompt: string,
  onProgress?: (value: number, max: number) => void
): Promise<string> => {
  const workflow = buildQwenReferenceWorkflow(prompt);
  const images = await queueAndWait(workflow, onProgress);
  if (images.length === 0) throw new Error('Qwen reference generation returned no image');
  return images[0];
};

// ═══════════════════════════════════════════════════════
// HIGH-LEVEL GENERATION — 6 VIEWS
// ═══════════════════════════════════════════════════════

export interface ComfyUIResult {
  /** Stitched image of views 1-3 (slide 1) */
  slide1: string;
  /** Stitched image of views 4-6 (slide 2) */
  slide2: string;
  /** All 6 individual view images */
  individualViews: string[];
}

/**
 * Generates 6 views using ComfyUI with the Qwen Multiangle workflow.
 *
 * Returns 2 stitched images (3 views each) for the 2 PDF slides,
 * plus all 6 individual images.
 *
 * @param referenceImage - Base64 data URL of the reference image
 * @param prompt - Object description (for naming)
 * @param onProgress - Progress callback
 */
export const generateWithComfyUI = async (
  referenceImage: string,
  prompt: string,
  onProgress?: (step: string, value: number, max: number) => void
): Promise<ComfyUIResult> => {
  // Upload reference image to ComfyUI
  onProgress?.('Upload de la référence...', 0, 100);
  const safeName = prompt.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  const filename = await uploadImageToComfyUI(referenceImage, `ref_${safeName}_${Date.now()}.png`);

  // Build and queue the 6-view workflow
  onProgress?.('Génération des 6 vues (Qwen)...', 0, 100);
  const workflow = buildQwenMultiangleWorkflow(filename, VIEWS_6_CUSTOM);

  const images = await queueAndWait(workflow, (value, max) => {
    onProgress?.('Génération des 6 vues (Qwen)...', value, max);
  });

  if (images.length < 3) {
    throw new Error(`ComfyUI returned only ${images.length} images (minimum 3 needed)`);
  }

  // Stitch into sets of 3
  onProgress?.('Assemblage des vues...', 90, 100);
  const slide1 = await stitchImages(images.slice(0, 3));

  // Slide 2 only if we have enough images (views 4-6)
  let slide2: string | undefined;
  if (images.length >= 6) {
    slide2 = await stitchImages(images.slice(3, 6));
  } else if (images.length > 3) {
    // Partial slide 2 with whatever views we got
    slide2 = await stitchImages(images.slice(3));
  }

  return {
    slide1,
    slide2: slide2 || slide1, // Fallback to slide1 if slide2 failed
    individualViews: images,
  };
};
