import { GoogleGenAI } from "@google/genai";
import { GeneratedImage, ViewName } from '../types';

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export type { ViewName };

export interface VerificationResult {
  groupId: number;
  itemId: number;
  itemName: string;
  isConsistent: boolean;
  issues: string[];
  confidence: number; // 0-100
  /** Which views are problematic — empty if fully consistent */
  problematicViews: ViewName[];
  /** Which views are kept (the good ones) */
  keptViews: ViewName[];
}

/**
 * Verifies the visual consistency of the 3 views in a generated image.
 * Uses Gemini vision to detect inconsistencies between the front, side, and rear views.
 * Now identifies WHICH specific view(s) are problematic.
 */
export const verifyImageConsistency = async (
  base64Image: string,
  itemName: string
): Promise<{ isConsistent: boolean; issues: string[]; confidence: number; problematicViews: ViewName[] }> => {
  const ai = getAIClient();

  const prompt = `You are a quality control inspector for 3D furniture/object reference sheets. A 3D artist will use these views to model the object, so only MAJOR structural problems matter.

This image shows a single object in 3 panels side by side:
- Left: Front view (0°) — identifier: "front"
- Center: Right side view (90°) — identifier: "side"
- Right: Rear view (180°) — identifier: "rear"

The object is: "${itemName}"

YOUR TASK: Check if the 3 views show fundamentally the SAME object. If not, identify WHICH specific view(s) are the outliers.

REJECT ONLY FOR THESE SERIOUS ISSUES:
- Different NUMBER of legs (e.g., 4 legs in front view but 3 in side view)
- Extra or missing MAJOR components (e.g., a drawer that appears in one view but doesn't exist in another, an armrest present in one view but gone in another)
- Completely different SHAPE (e.g., round table in one view, rectangular in another)
- Clearly different OBJECT TYPE (e.g., looks like a different piece of furniture in one panel)
- A component that is structurally impossible given the other views (e.g., a handle on the side that has no physical space based on the front view)

DO NOT REJECT FOR:
- Minor differences in texture, grain, or color shade between views (these are normal rendering variations)
- Slightly different proportions or scale between panels
- Small details like stitching patterns, subtle edge differences, minor hardware variations
- Features not visible due to viewing angle (a handle on the front not visible from the back is NORMAL)
- Slight differences in lighting, shadow, or surface reflection
- Minor variations in cushion shape, fabric folds, or organic textures
- Any difference that a 3D artist could easily fix or ignore

YOUR DEFAULT SHOULD BE TO ACCEPT. Only reject when a 3D artist would look at these views and say "these are clearly not the same object" or "I cannot model one single object from these views because the structure contradicts itself."

Respond in JSON:
{
  "isConsistent": true/false,
  "confidence": 0-100,
  "issues": ["description of serious issue in French"],
  "problematicViews": ["front", "side", "rear"]
}

IMPORTANT for problematicViews:
- If all views are consistent, set to empty array []
- If one view is clearly the outlier (doesn't match the other two), list ONLY that one view (e.g. ["rear"])
- If two views don't match each other but one pair is more "correct", list the odd one out
- If all 3 are inconsistent with each other, list all three ["front", "side", "rear"]
- The goal is to identify the MINIMUM number of views to remove so the remaining views are consistent

If acceptable, set isConsistent to true, issues to [], and problematicViews to [].
If rejecting, describe ONLY the major structural issue(s) in French.`;

  try {
    // Extract base64 content and mime type
    const base64Content = base64Image.split(',')[1];
    const mimeType = base64Image.split(';')[0].split(':')[1] || 'image/png';

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                data: base64Content,
                mimeType: mimeType,
              }
            },
            { text: prompt }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
      }
    });

    const textOutput = response.text;
    if (!textOutput) {
      return { isConsistent: true, issues: ['Vérification impossible - image acceptée par défaut'], confidence: 0, problematicViews: [] };
    }

    const result = JSON.parse(textOutput);
    const problematicViews: ViewName[] = (result.problematicViews || []).filter(
      (v: string) => v === 'front' || v === 'side' || v === 'rear'
    );

    return {
      isConsistent: result.isConsistent ?? true,
      issues: result.issues ?? [],
      confidence: result.confidence ?? 50,
      problematicViews,
    };
  } catch (e) {
    console.error(`Error verifying image consistency for ${itemName}:`, e);
    // On error, accept the image by default to not block the pipeline
    return { isConsistent: true, issues: ['Erreur de vérification - image acceptée par défaut'], confidence: 0, problematicViews: [] };
  }
};

/**
 * Batch-verifies all generated images and returns results.
 * Processes images sequentially to avoid rate limits.
 */
export const verifyAllImages = async (
  images: GeneratedImage[],
  getItemName: (img: GeneratedImage) => string,
  onProgress?: (current: number, total: number, currentItem: string) => void
): Promise<VerificationResult[]> => {
  const results: VerificationResult[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const itemName = getItemName(img);
    onProgress?.(i + 1, images.length, itemName);

    const verification = await verifyImageConsistency(img.base64, itemName);

    const allViews: ViewName[] = ['front', 'side', 'rear'];
    const keptViews = allViews.filter(v => !verification.problematicViews.includes(v));

    results.push({
      groupId: img.groupId,
      itemId: img.itemId,
      itemName,
      isConsistent: verification.isConsistent,
      issues: verification.issues,
      confidence: verification.confidence,
      problematicViews: verification.problematicViews,
      keptViews,
    });

    // Small delay between checks to avoid rate limits
    if (i < images.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
};

/**
 * Crops individual views from a triptych image (3 panels side by side).
 * Returns base64 strings for each of the 3 views: [front, side, rear].
 */
export const cropViewsFromTriptych = (
  triptychBase64: string
): Promise<{ front: string; side: string; rear: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const viewWidth = Math.floor(img.width / 3);
      const viewHeight = img.height;

      const views: Record<ViewName, string> = { front: '', side: '', rear: '' };
      const viewNames: ViewName[] = ['front', 'side', 'rear'];

      for (let i = 0; i < 3; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = viewWidth;
        canvas.height = viewHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, i * viewWidth, 0, viewWidth, viewHeight, 0, 0, viewWidth, viewHeight);
        views[viewNames[i]] = canvas.toDataURL('image/png');
      }

      resolve(views);
    };
    img.onerror = () => reject(new Error('Failed to load triptych image for cropping'));
    img.src = triptychBase64;
  });
};

/**
 * Stitches selected views back into a single image.
 * Only includes the views that are in the keptViews array.
 * Returns a base64 string of the stitched image.
 */
export const stitchKeptViews = (
  views: { front: string; side: string; rear: string },
  keptViews: ViewName[]
): Promise<string> => {
  return new Promise((resolve, reject) => {
    // Load all kept view images
    const loadPromises = keptViews.map(viewName => {
      return new Promise<{ name: ViewName; img: HTMLImageElement }>((res, rej) => {
        const img = new Image();
        img.onload = () => res({ name: viewName, img });
        img.onerror = () => rej(new Error(`Failed to load ${viewName} view`));
        img.src = views[viewName];
      });
    });

    Promise.all(loadPromises).then(loadedViews => {
      if (loadedViews.length === 0) {
        reject(new Error('No views to stitch'));
        return;
      }

      const viewWidth = loadedViews[0].img.width;
      const viewHeight = loadedViews[0].img.height;

      const canvas = document.createElement('canvas');
      canvas.width = viewWidth * loadedViews.length;
      canvas.height = viewHeight;
      const ctx = canvas.getContext('2d')!;

      loadedViews.forEach((v, i) => {
        ctx.drawImage(v.img, i * viewWidth, 0);
      });

      resolve(canvas.toDataURL('image/png'));
    }).catch(reject);
  });
};

/**
 * Processes verification results: for inconsistent images, crops out problematic views
 * and creates a new stitched image with only the good views.
 * Returns updated images (modified in place with new base64 for trimmed objects)
 * and the list of fully-rejected images (all 3 views bad).
 */
export const processVerificationResults = async (
  images: GeneratedImage[],
  verificationResults: VerificationResult[]
): Promise<{ processed: GeneratedImage[]; trimmedCount: number; fullyRejectedCount: number }> => {
  const processed: GeneratedImage[] = [];
  let trimmedCount = 0;
  let fullyRejectedCount = 0;

  for (const img of images) {
    const result = verificationResults.find(
      r => r.groupId === img.groupId && r.itemId === img.itemId
    );

    if (!result || result.isConsistent || result.problematicViews.length === 0) {
      // Fully consistent or no verification — keep as-is
      processed.push(img);
    } else if (result.keptViews.length === 0) {
      // All views are bad — fully reject this object
      fullyRejectedCount++;
      // Still include it but mark it — the UI will show a warning
      processed.push(img);
    } else {
      // Some views are bad — crop and restitch with only good views
      try {
        const views = await cropViewsFromTriptych(img.base64);
        const newBase64 = await stitchKeptViews(views, result.keptViews);
        processed.push({
          ...img,
          base64: newBase64,
          keptViews: result.keptViews,
        });
        trimmedCount++;
      } catch (e) {
        console.error(`Failed to crop views for ${result.itemName}, keeping original:`, e);
        processed.push(img);
      }
    }
  }

  return { processed, trimmedCount, fullyRejectedCount };
};

/**
 * @deprecated Use processVerificationResults instead.
 * Kept for backward compatibility — filters images to only keep consistent ones.
 */
export const filterConsistentImages = (
  images: GeneratedImage[],
  verificationResults: VerificationResult[]
): { consistent: GeneratedImage[]; rejected: GeneratedImage[] } => {
  const consistent: GeneratedImage[] = [];
  const rejected: GeneratedImage[] = [];

  for (const img of images) {
    const result = verificationResults.find(
      r => r.groupId === img.groupId && r.itemId === img.itemId
    );

    if (!result || result.isConsistent) {
      consistent.push(img);
    } else {
      rejected.push(img);
    }
  }

  return { consistent, rejected };
};
