import { GoogleGenAI, Type } from "@google/genai";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export interface GeneratedPromptItem {
  number: number;
  title: string;        // e.g. "Canapé modulable bas (pale apricot + crème)"
  colors: string;       // e.g. "pale apricot + crème"
  prompt: string;       // The full PROMPT text
  dimensions: string;   // e.g. "240 x 102 x 76"
}

export interface PromptGenerationConfig {
  theme: string;           // e.g. "objets et meubles d'intérieur colorés"
  season: string;          // e.g. "printemps-été 2026"
  count: number;           // Number of prompts to generate (e.g. 30)
  style?: string;          // e.g. "contemporain", "scandinave", "art déco"
  colorPalette?: string;   // e.g. "pastels lumineux", "tons terre chauds"
  objectTypes?: string;    // e.g. "canapés, fauteuils, tables, rangements, luminaires, accessoires"
}

/**
 * The exact template structure extracted from the user's PDF reference.
 * This is the canonical format that all generated prompts must follow.
 */
const PROMPT_TEMPLATE = `Génère une planche produit montrant {article} {objectDescription}, {detailedDescription}. Important : crée un design 100% original et générique ; l'IA ne doit en aucun cas reproduire, imiter ou s'inspirer trop fidèlement d'un meuble/produit déjà existant (marques, modèles, designs reconnaissables). Affiche l'objet entièrement visible sous 3 vues distinctes : de face, de côté (profil droit) et de derrière, côte à côte et à la même échelle, rendu photoréaliste, éclairage studio neutre, fond blanc uniforme sans éléments décoratifs, sans ombres dures, sans logo, sans humains. Sous les 3 vues, inscris les dimensions réelles au format : Longueur (cm) x Profondeur (cm) x Hauteur (cm) : {dimensions}.`;

/**
 * Generates a complete set of prompts following the exact structure of the reference PDF.
 * Uses Gemini to create original object concepts with consistent formatting.
 */
export const generatePromptFile = async (config: PromptGenerationConfig): Promise<GeneratedPromptItem[]> => {
  const ai = getAIClient();

  // We generate in batches to stay within output limits
  const batchSize = 10;
  const batches = Math.ceil(config.count / batchSize);
  const allItems: GeneratedPromptItem[] = [];

  for (let batch = 0; batch < batches; batch++) {
    const startNum = batch * batchSize + 1;
    const endNum = Math.min((batch + 1) * batchSize, config.count);
    const count = endNum - startNum + 1;

    // Avoid duplicates by listing what was already generated
    const existingTitles = allItems.map(item => item.title).join(', ');
    const avoidClause = existingTitles
      ? `\n\nOBJETS DÉJÀ GÉNÉRÉS (ne pas répéter ni proposer de variantes trop proches) : ${existingTitles}`
      : '';

    const systemPrompt = `Tu es un expert en design d'intérieur et en rédaction de prompts pour la génération d'images IA de meubles et objets.

OBJECTIF : Générer exactement ${count} fiches de prompts d'objets numérotés de ${startNum} à ${endNum}.

THÈME : ${config.theme}
SAISON / COLLECTION : ${config.season}
${config.style ? `STYLE DIRECTEUR : ${config.style}` : ''}
${config.colorPalette ? `PALETTE DE COULEURS : ${config.colorPalette}` : ''}
${config.objectTypes ? `TYPES D'OBJETS À COUVRIR : ${config.objectTypes}` : 'TYPES D'OBJETS : Varier largement — canapés, fauteuils, tables (repas, basse, chevet), rangements (buffet, commode, bibliothèque, meuble TV), bureau, chaises, luminaires, miroirs, tapis, accessoires déco.'}
${avoidClause}

STRUCTURE OBLIGATOIRE pour chaque objet (respecte-la à la lettre) :

1. "title" : Le titre numéroté de l'objet au format "Nom de l'objet (couleur principale + matériau ou couleur secondaire)"
   Exemples : "Canapé modulable bas (pale apricot + crème)", "Fauteuil club compact (seafoam green + noyer)"

2. "colors" : Les couleurs et matériaux entre parenthèses du titre
   Exemples : "pale apricot + crème", "seafoam green + noyer"

3. "prompt" : Le texte complet du prompt en suivant EXACTEMENT ce modèle :
   "Génère une planche produit montrant [article défini] [nom objet] d'intérieur, [description physique détaillée : revêtement, matériau, couleur, texture, forme, pieds/base, style, ambiance saisonnière]. Important : crée un design 100% original et générique ; l'IA ne doit en aucun cas reproduire, imiter ou s'inspirer trop fidèlement d'un meuble/produit déjà existant (marques, modèles, designs reconnaissables). Affiche l'objet entièrement visible sous 3 vues distinctes : de face, de côté (profil droit) et de derrière, côte à côte et à la même échelle, rendu photoréaliste, éclairage studio neutre, fond blanc uniforme sans éléments décoratifs, sans ombres dures, sans logo, sans humains. Sous les 3 vues, inscris les dimensions réelles au format : Longueur (cm) x Profondeur (cm) x Hauteur (cm) : [dimensions]."

4. "dimensions" : Les dimensions réalistes L x P x H en cm (valeurs crédibles pour le type d'objet)

RÈGLES CRÉATIVES :
- Chaque objet doit être unique et cohérent avec la saison/collection
- Utiliser des noms de couleurs évocateurs en anglais (seafoam, butter yellow, pale blue, soft coral, sage green, lavender mist, melon, kiwi green, terracotta pale, etc.)
- Mentionner des matériaux variés : bois (noyer, chêne clair, white oak), métal (laiton, chrome), pierre (travertin), verre (clair, fumé, cannelé), textile (bouclette, lin, tressé)
- Les dimensions doivent être réalistes et précises pour chaque type d'objet
- Varier les styles descriptifs : "style contemporain décontracté", "lignes nettes", "allure lumineuse et saisonnière", "design pratique", etc.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: systemPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              number: { type: Type.INTEGER, description: "Numéro séquentiel de l'objet" },
              title: { type: Type.STRING, description: "Titre au format 'Nom objet (couleurs + matériaux)'" },
              colors: { type: Type.STRING, description: "Couleurs et matériaux extraits du titre" },
              prompt: { type: Type.STRING, description: "Texte complet du prompt suivant le modèle exact" },
              dimensions: { type: Type.STRING, description: "Dimensions L x P x H en cm" }
            },
            required: ["number", "title", "colors", "prompt", "dimensions"]
          }
        }
      }
    });

    const textOutput = response.text;
    if (textOutput) {
      const items = JSON.parse(textOutput) as GeneratedPromptItem[];
      // Re-number to ensure continuity
      items.forEach((item, idx) => {
        item.number = startNum + idx;
      });
      allItems.push(...items);
    }

    // Pause between batches to avoid rate limits
    if (batch < batches - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return allItems;
};

/**
 * Formats generated prompts into a text file matching the PDF reference format.
 */
export const formatPromptsAsText = (
  items: GeneratedPromptItem[],
  config: PromptGenerationConfig
): string => {
  const header = `Prompts - ${items.length} ${config.theme}, ${config.season}${config.style ? ` (${config.style})` : ''}\n`;
  const structureNote = `Structure identique : titre numéroté → PROMPT : → clause Important → 3 vues → dimensions.\n`;
  const separator = '─'.repeat(80);

  let output = header + '\n' + structureNote + '\n' + separator + '\n\n';

  for (const item of items) {
    output += `${item.number}) ${item.title}\n\n`;
    output += `PROMPT :\n`;
    output += `${item.prompt}\n\n`;
    output += separator + '\n\n';
  }

  return output;
};

/**
 * Generates prompts and returns them as a downloadable Blob (text file).
 */
export const generateAndDownloadPrompts = async (
  config: PromptGenerationConfig,
  onProgress?: (current: number, total: number) => void
): Promise<{ items: GeneratedPromptItem[]; textContent: string }> => {
  onProgress?.(0, config.count);

  const items = await generatePromptFile(config);

  onProgress?.(items.length, config.count);

  const textContent = formatPromptsAsText(items, config);

  return { items, textContent };
};
