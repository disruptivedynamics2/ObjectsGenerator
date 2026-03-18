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
  return `Technical orthographic reference sheet of a single object: ${prompt}.

FORMAT: One horizontal image divided into exactly 3 equal panels arranged LEFT to RIGHT in a single row.

PANEL LAYOUT (strict):
  Panel 1 (left third): FRONT elevation view, camera at 0° azimuth
  Panel 2 (center third): RIGHT SIDE elevation view, camera at 90° azimuth
  Panel 3 (right third): REAR elevation view, camera at 180° azimuth

IDENTITY LOCK — the object in all 3 panels MUST be:
  • The exact same model, shape, silhouette, proportions and scale
  • The exact same materials, colors, textures, patterns and finishes
  • The exact same details: handles, legs, edges, stitching, hardware
  • Only the camera angle changes — nothing else differs between panels

COMPOSITION RULES:
  • Pure solid white (#FFFFFF) background with no shadows on background
  • Soft, even studio lighting from slightly above, no dramatic shadows
  • Each panel occupies exactly one-third of the total width
  • Object centered vertically and horizontally within each panel
  • Consistent scale: the object appears the same size in all 3 panels
  • Thin subtle light gray vertical dividers between panels

FORBIDDEN:
  • No text, labels, watermarks, annotations, or dimensions
  • No perspective distortion — use flat orthographic projection
  • No additional objects, decorations, or context
  • No more and no fewer than exactly 3 views
  • No vertical stacking or multiple rows
  • No variations in the object design between views

RENDERING: Photorealistic product visualization, 8K resolution, sharp focus, professional catalog quality.`;
};

/**
 * Generates an image for a specific prompt using the selected model.
 * Applies generic quality enhancements without assuming the subject.
 */
export const generateImageForPrompt = async (
  prompt: string,
  imageSize: ImageSize = '1K',
  model: ImageModel = 'gemini-3-pro-image-preview'
): Promise<string> => {
  const ai = getAIClient();

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

  if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
              return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          }
      }
  }

  throw new Error("No image generated");
};