import { GoogleGenAI } from "@google/genai";
import { GeneratedImage } from '../types';

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export interface VerificationResult {
  groupId: number;
  itemId: number;
  itemName: string;
  isConsistent: boolean;
  issues: string[];
  confidence: number; // 0-100
}

/**
 * Verifies the visual consistency of the 3 views in a generated image.
 * Uses Gemini vision to detect inconsistencies between the front, side, and rear views.
 * Returns whether the image passes the consistency check.
 */
export const verifyImageConsistency = async (
  base64Image: string,
  itemName: string
): Promise<{ isConsistent: boolean; issues: string[]; confidence: number }> => {
  const ai = getAIClient();

  const prompt = `You are a quality control inspector for 3D furniture/object reference sheets. A 3D artist will use these views to model the object, so only MAJOR structural problems matter.

This image shows a single object in 3 panels side by side:
- Left: Front view (0°)
- Center: Right side view (90°)
- Right: Rear view (180°)

The object is: "${itemName}"

YOUR TASK: Check if the 3 views show fundamentally the SAME object. Only reject for MAJOR structural inconsistencies.

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
  "issues": ["description of serious issue"]
}

If acceptable, set isConsistent to true and issues to an empty array.
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
      return { isConsistent: true, issues: ['Vérification impossible - image acceptée par défaut'], confidence: 0 };
    }

    const result = JSON.parse(textOutput);
    return {
      isConsistent: result.isConsistent ?? true,
      issues: result.issues ?? [],
      confidence: result.confidence ?? 50,
    };
  } catch (e) {
    console.error(`Error verifying image consistency for ${itemName}:`, e);
    // On error, accept the image by default to not block the pipeline
    return { isConsistent: true, issues: ['Erreur de vérification - image acceptée par défaut'], confidence: 0 };
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

    results.push({
      groupId: img.groupId,
      itemId: img.itemId,
      itemName,
      isConsistent: verification.isConsistent,
      issues: verification.issues,
      confidence: verification.confidence,
    });

    // Small delay between checks to avoid rate limits
    if (i < images.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  return results;
};

/**
 * Filters images to only keep consistent ones based on verification results.
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
