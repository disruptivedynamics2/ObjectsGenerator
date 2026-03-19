import { GoogleGenAI, Type } from "@google/genai";
import { PromptGroup, ImageSize, ImageModel } from '../types';

const getAIClient = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Analyzes a chunk of text to extract prompts.
 */
const analyzePromptsChunk = async (text: string, chunkIndex: number): Promise<PromptGroup[]> => {
  const ai = getAIClient();
  
  const prompt = `
    Role: Expert Data Extractor.
    Task: Analyze the provided text and identify distinct image generation prompts.
    This is chunk #${chunkIndex + 1} of a larger document.
    
    Instructions:
    1. Read the text and identify descriptions of objects or furniture intended to be used as image prompts.
    2. Group them logically if the text has sections.
    3. IMPORTANT: Do not duplicate prompts.
    4. Focus on the physical description of the object. Ignore instructions about the number of views if they are present in the text, as the application will handle the multi-view generation automatically.
    5. For each detected prompt, extract:
       - "name": Create a very short, concise title (2-5 words) summarizing the prompt.
       - "prompt": Extract the EXACT, FULL, UNMODIFIED text of the prompt as it appears in the input. Do not summarize or change the wording. Clean up newlines if necessary, but keep the content identical.
       - "dimensions": Look for physical dimensions (e.g., "290 x 105 x 65" or "200cm x 100cm"). Extract them in the format "L x l x h". If not found, leave null.
    
    Robustness:
    - Output strictly valid JSON.
    - Ignore page numbers or irrelevant footer text.
    - If the text is just a list of lines, treat each line as a prompt.

    Input Text:
    """
    ${text}
    """
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.INTEGER, description: "Unique ID for the group" },
              name: { type: Type.STRING, description: "Name of the section/group" },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Short title" },
                    prompt: { type: Type.STRING, description: "Full prompt text" },
                    dimensions: { type: Type.STRING, description: "Extracted dimensions (L x l x h)", nullable: true }
                  },
                  required: ["name", "prompt"]
                }
              }
            },
            required: ["id", "name", "items"]
          }
        }
      }
    });

    const textOutput = response.text;
    if (!textOutput) return [];

    return JSON.parse(textOutput) as PromptGroup[];
  } catch (e) {
    console.error(`Error analyzing prompts chunk ${chunkIndex}`, e);
    return [];
  }
};

/**
 * Parses raw PDF text to extract structured Prompts.
 * Splits the text into manageable chunks and processes them in parallel for speed.
 */
export const analyzePdfContent = async (text: string): Promise<PromptGroup[]> => {
  const CHUNK_SIZE = 40000; // Increased chunk size for fewer requests
  const chunks: string[] = [];
  
  // Intelligent splitting to avoid cutting prompts in the middle
  let remainingText = text;
  while (remainingText.length > 0) {
    if (remainingText.length <= CHUNK_SIZE) {
      chunks.push(remainingText);
      break;
    }
    
    // Try to find a good split point (a prompt separator like "---")
    let splitPoint = remainingText.lastIndexOf("\n---", CHUNK_SIZE);
    if (splitPoint === -1) {
      splitPoint = remainingText.lastIndexOf("\n\n", CHUNK_SIZE);
    }
    if (splitPoint === -1) {
      splitPoint = CHUNK_SIZE;
    }
    
    chunks.push(remainingText.substring(0, splitPoint));
    remainingText = remainingText.substring(splitPoint).trim();
  }

  console.log(`Processing ${chunks.length} chunks...`);
  
  const allGroups: PromptGroup[] = [];
  
  // Process chunks in small batches to avoid rate limits
  const BATCH_SIZE = 3;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((chunk, index) => analyzePromptsChunk(chunk, i + index)));
    allGroups.push(...results.flat());
    
    if (i + BATCH_SIZE < chunks.length) {
      // Small pause between batches
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  if (allGroups.length === 0) {
    throw new Error("Aucun prompt détecté dans le fichier. Assurez-vous qu'il contient du texte descriptif.");
  }

  // Merge groups with the same name and re-index
  const mergedGroups: { [key: string]: PromptGroup } = {};
  let groupIdCounter = 1;

  allGroups.forEach(group => {
    const name = group.name || "Général";
    if (!mergedGroups[name]) {
      mergedGroups[name] = {
        id: groupIdCounter++,
        name: name,
        items: []
      };
    }
    
    // Add items, avoiding duplicates within the same group
    group.items.forEach(item => {
        const isDuplicate = mergedGroups[name].items.some(existing => 
            existing.name === item.name || existing.prompt === item.prompt
        );
        if (!isDuplicate) {
            mergedGroups[name].items.push(item);
        }
    });
  });

  return Object.values(mergedGroups);
};

/**
 * Builds the enhanced prompt with strict consistency constraints.
 * Exported so it can be reused by batchService.
 */
export const buildEnhancedPrompt = (prompt: string): string => {
  // Detect round/oval/symmetrical objects that need elevated camera angle
  const lowerPrompt = prompt.toLowerCase();
  const needsElevatedView = /\b(rond|ronde|ronds|rondes|circulaire|ovale|ovales|cylindr|sphér|boule|dôme|round|circular|oval|cylinder|sphere|ball|dome|table\s+(ronde|basse|d'appoint|guéridon)|guéridon|pouf|tabouret|vase|bol|plateau|miroir\s+rond|lampe\s+(boule|champignon|globe)|abat-jour)\b/i.test(lowerPrompt);

  const cameraAngle = needsElevatedView
    ? `CAMERA ELEVATION: This object has a round, oval, or highly symmetrical shape. Use a SLIGHTLY ELEVATED camera (15-20° above eye level, looking slightly downward) for ALL 3 views so the top surface is partially visible and each view is distinguishable. The camera still rotates at 0°, 90°, 180° azimuth — only the vertical elevation changes.`
    : `CAMERA ELEVATION: Straight-on eye-level camera (0° elevation). The camera rotates horizontally around the object.`;

  return `TASK: Create a single image showing ONE object photographed from exactly 3 angles, like a product turnaround sheet.

STEP 1 — DESIGN THE OBJECT (do this mentally before rendering):
Design one single, specific object matching this description: ${prompt}.
Lock in every detail: exact shape, exact number of legs/drawers/handles/shelves, exact materials, exact colors, exact proportions, exact hardware. This locked design is the ONLY object that appears in all 3 panels. Think of it as one real physical object being photographed 3 times — because that is exactly what this is.

STEP 2 — RENDER THE TURNAROUND:
Create one wide horizontal image split into exactly 3 equal vertical panels side by side:

  LEFT PANEL:   FRONT view — camera faces the object straight on (0° azimuth)
  CENTER PANEL: RIGHT SIDE view — camera has moved 90° clockwise around the same object
  RIGHT PANEL:  REAR view — camera has moved 180° around the same object (seeing the back)

${cameraAngle}

CRITICAL CONSISTENCY RULES (these are the #1 priority):
  1. SAME OBJECT: All 3 panels show the IDENTICAL object. Not similar — identical. Same silhouette, same proportions, same height, same width.
  2. SAME STRUCTURE: Exact same number of legs, arms, drawers, handles, shelves, panels, cushions, buttons in every view. If the front has 4 legs, the side and back must also show the correct 4 legs from their respective angles.
  3. SAME SURFACE: Exact same materials, wood grain direction, fabric texture, color shade, upholstery pattern, stitching, hardware finish in all panels.
  4. SAME SCALE: The object must appear the same physical size in all 3 panels — same height in pixels, same apparent volume.
  5. ANGULAR CORRECTNESS: Features visible from the front (like a handle on the front face) should NOT appear on the back view unless they physically exist on both sides. Think about what is truly visible from each angle.
  6. NO MORPHING: The object must not subtly change shape, add/remove details, or shift proportions between panels. It is ONE frozen object, just rotated.

COMPOSITION:
  • Pure white (#FFFFFF) background, no floor shadow, no gradient
  • Soft even studio lighting from above, no dramatic shadows
  • Each panel = exactly one third of the total image width
  • Object perfectly centered (vertically and horizontally) in each panel
  • Thin light gray vertical lines separating the 3 panels

ABSOLUTELY FORBIDDEN:
  • Any text, labels, watermarks, annotations, or dimension markings
  • Any decorative props, plants, or context objects
  • More or fewer than exactly 3 views
  • Vertical stacking — panels must be horizontal, left to right
  • Any variation in the object's design between the 3 views

RENDERING QUALITY: Photorealistic product photography, 8K resolution, crisp focus, professional catalog standard.`;
};

/**
 * Builds a prompt for generating a single reference view (Pass 1 of high-coherence mode).
 */
export const buildReferencePrompt = (prompt: string): string => {
  return `Create a single photorealistic product photograph of this object: ${prompt}.

REQUIREMENTS:
- Show the object from a FRONT 3/4 VIEW (slightly angled, about 30° to the right) so we can see both the front face and one side.
- The object must be FULLY visible from top to bottom, nothing cropped.
- Pure white (#FFFFFF) background, no shadows on background.
- Soft, even studio lighting from above.
- Photorealistic rendering, 8K quality, sharp focus, professional catalog standard.
- 100% ORIGINAL design — do not reproduce any existing real product.
- Show EVERY structural detail clearly: legs, handles, drawers, cushions, edges, hardware, stitching, texture.

This image will be used as a design reference to generate multiple views, so every detail must be crisp and unambiguous.`;
};

/**
 * Builds a prompt for generating the 3-view turnaround using a reference image (Pass 2).
 */
export const buildTurnaroundFromRefPrompt = (prompt: string): string => {
  const lowerPrompt = prompt.toLowerCase();
  const needsElevatedView = /\b(rond|ronde|ronds|rondes|circulaire|ovale|ovales|cylindr|sphér|boule|dôme|round|circular|oval|cylinder|sphere|ball|dome|table\s+(ronde|basse|d'appoint|guéridon)|guéridon|pouf|tabouret|vase|bol|plateau|miroir\s+rond|lampe\s+(boule|champignon|globe)|abat-jour)\b/i.test(lowerPrompt);

  const cameraAngle = needsElevatedView
    ? `CAMERA ELEVATION: This object is round/oval/symmetrical. Use a SLIGHTLY ELEVATED camera (15-20° above eye level) for all 3 views to reveal the top surface.`
    : `CAMERA ELEVATION: Straight-on eye-level camera for all 3 views.`;

  return `TASK: Look at the attached reference image. It shows a single piece of furniture/object.
You must create a NEW image showing THIS EXACT SAME OBJECT from exactly 3 angles.

CRITICAL: The object in your output must be IDENTICAL to the one in the reference image.
- Same EXACT shape, silhouette, and proportions
- Same EXACT number of legs, handles, drawers, cushions, shelves — count them in the reference and match precisely
- Same EXACT materials, colors, textures, wood grain, fabric weave
- Same EXACT hardware, stitching, edge profiles, decorative details
- Do NOT add, remove, or modify ANY detail. Copy the reference design exactly.

OUTPUT FORMAT: One wide horizontal image with exactly 3 equal vertical panels side by side:

  LEFT PANEL:   FRONT view (0° azimuth) — camera faces the object straight on
  CENTER PANEL: RIGHT SIDE view (90° azimuth) — camera rotated 90° clockwise
  RIGHT PANEL:  REAR view (180° azimuth) — camera sees the back of the object

${cameraAngle}

COMPOSITION:
  • Pure white (#FFFFFF) background, no floor shadow
  • Soft even studio lighting from above
  • Each panel = exactly one third of the total width
  • Object perfectly centered in each panel, same scale in all 3
  • Thin light gray vertical lines separating panels

FORBIDDEN: Any text, labels, watermarks. Any props or context objects. Any variation from the reference design.

RENDERING: Photorealistic, 8K resolution, crisp focus, professional catalog quality.`;
};

/**
 * Extracts base64 image data from a Gemini response.
 */
export const extractImageFromResponse = (response: any): string | null => {
  if (response.candidates?.[0]?.content?.parts) {
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
      }
    }
  }
  return null;
};

/**
 * Generates an image for a specific prompt using the selected model.
 * Supports two modes:
 * - Standard: single-pass 3-view generation
 * - High Coherence: two-pass (reference image + 3-view from reference)
 */
export const generateImageForPrompt = async (
  prompt: string,
  imageSize: ImageSize = '1K',
  model: ImageModel = 'gemini-3-pro-image-preview',
  highCoherence: boolean = false
): Promise<string> => {
  const ai = getAIClient();

  if (!highCoherence) {
    // Standard single-pass mode
    const enhancedPrompt = buildEnhancedPrompt(prompt);

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [{ text: enhancedPrompt }]
      },
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: imageSize
        }
      }
    });

    const image = extractImageFromResponse(response);
    if (image) return image;
    throw new Error("No image generated");
  }

  // ═══ HIGH COHERENCE: Two-pass generation ═══

  // PASS 1: Generate a single reference image of the object
  const refPrompt = buildReferencePrompt(prompt);

  const refResponse = await ai.models.generateContent({
    model: model,
    contents: {
      parts: [{ text: refPrompt }]
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1",
        imageSize: "1K" // Reference doesn't need max resolution
      }
    }
  });

  const refImage = extractImageFromResponse(refResponse);
  if (!refImage) {
    throw new Error("Failed to generate reference image (pass 1)");
  }

  // Extract raw base64 for the API call
  const refBase64 = refImage.split(',')[1];
  const refMimeType = refImage.split(';')[0].split(':')[1] || 'image/png';

  // PASS 2: Generate the 3-view turnaround using the reference image as input
  const turnaroundPrompt = buildTurnaroundFromRefPrompt(prompt);

  const turnaroundResponse = await ai.models.generateContent({
    model: model,
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: refBase64,
              mimeType: refMimeType,
            }
          },
          { text: turnaroundPrompt }
        ]
      }
    ],
    config: {
      imageConfig: {
        aspectRatio: "16:9",
        imageSize: imageSize
      }
    }
  });

  const finalImage = extractImageFromResponse(turnaroundResponse);
  if (finalImage) return finalImage;

  throw new Error("Failed to generate 3-view turnaround from reference (pass 2)");
};