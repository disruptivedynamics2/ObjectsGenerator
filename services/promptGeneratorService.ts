import { GoogleGenAI, Type } from "@google/genai";

const getAIClient = () => {
  return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

/**
 * Fixes common accent corruption in Gemini outputs where
 * accented characters get replaced by their numeric codes.
 * e.g. "G3n2re" → "Génère", "canap3" → "canapé"
 */
const fixAccents = (text: string): string => {
  // Common French words with known accent patterns
  const replacements: [RegExp, string][] = [
    // Words starting with G/g
    [/\bG3n2re\b/g, 'Génère'],
    [/\bg3n2re\b/g, 'génère'],
    [/\bg3n3rique\b/g, 'générique'],
    [/\bg3n3r/g, 'génér'],
    // Words with é (most common: 3 → é)
    [/\bcanap3\b/g, 'canapé'],
    [/\bint3rieur/g, 'intérieur'],
    [/\bext3rieur/g, 'extérieur'],
    [/\bd3j0\b/g, 'déjà'],
    [/\bd3structur3/g, 'déstructuré'],
    [/\bd3coratif/g, 'décoratif'],
    [/\bd3contract3/g, 'décontracté'],
    [/\bd3tails/g, 'détails'],
    [/\bd3sign/g, 'design'],
    [/\b3pur3/g, 'épuré'],
    [/\b3l3ment/g, 'élément'],
    [/\b3l3gant/g, 'élégant'],
    [/\b3clairage/g, 'éclairage'],
    [/\b3chelle/g, 'échelle'],
    [/\b3tag2re/g, 'étagère'],
    [/\b3paisse/g, 'épaisse'],
    [/\bphotore3aliste/g, 'photoréaliste'],
    [/\bphotor3aliste/g, 'photoréaliste'],
    [/\benti2rement/g, 'entièrement'],
    [/\bderri2re/g, 'derrière'],
    [/\bsaisonni2re/g, 'saisonnière'],
    [/\blumi2re/g, 'lumière'],
    [/\bbiblioth2que/g, 'bibliothèque'],
    // è → 2
    [/\bmod2les/g, 'modèles'],
    [/\bfid2lement/g, 'fidèlement'],
    [/\bgr2ge/g, 'grège'],
    // ê → 2
    [/\brev2tement/g, 'revêtement'],
    [/\bm2me/g, 'même'],
    [/\bch2ne/g, 'chêne'],
    [/\bcr2me/g, 'crème'],
    // ô → 4
    [/\bc4t3\b/g, 'côté'],
    [/\bc4te\b/g, 'côte'],
    // à → 0
    [/\b0 la\b/g, 'à la'],
    [/\b0 c4te\b/g, 'à côte'],
    // Common suffixes
    [/3s\b/g, 'és'],
    [/3e\b/g, 'ée'],
    [/3es\b/g, 'ées'],
    // Specific patterns in the template
    [/laqu3\b/g, 'laqué'],
    [/teint3\b/g, 'teinté'],
    [/bross3\b/g, 'brossé'],
    [/satin3\b/g, 'satiné'],
    [/dor3\b/g, 'doré'],
    [/fusel3s\b/g, 'fuselés'],
    [/encastr3/g, 'encastré'],
    [/effil3s\b/g, 'effilés'],
    [/tress3\b/g, 'tressé'],
    [/cannel3\b/g, 'cannelé'],
    [/textur3/g, 'texturé'],
    [/capitonn3/g, 'capitonné'],
    [/articul3/g, 'articulé'],
    [/poign3e/g, 'poignée'],
    [/bouch3s/g, 'bouchés'],
    [/pi3tement/g, 'piètement'],
    [/m3tal/g, 'métal'],
    [/c3ramique/g, 'céramique'],
    [/sup3rieur/g, 'supérieur'],
    [/sph3rique/g, 'sphérique'],
    [/a3rienne/g, 'aérienne'],
    [/lat3raux/g, 'latéraux'],
    [/r3elles/g, 'réelles'],
    [/l3ger/g, 'léger'],
    [/r3aliste/g, 'réaliste'],
  ];

  let fixed = text;
  for (const [pattern, replacement] of replacements) {
    fixed = fixed.replace(pattern, replacement);
  }

  return fixed;
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
  styleContext?: string;   // Additional design style context (materials, visual keywords, etc.)
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
${config.objectTypes ? `TYPES D'OBJETS À COUVRIR : ${config.objectTypes}` : "TYPES D'OBJETS : Varier largement — canapés, fauteuils, tables (repas, basse, chevet), rangements (buffet, commode, bibliothèque, meuble TV), bureau, chaises, luminaires, miroirs, tapis, accessoires déco."}
${config.styleContext ? `\nCONTEXTE STYLE DE DESIGN :\n${config.styleContext}\nChaque objet généré doit incarner ce style : formes, matériaux, couleurs et finitions doivent être cohérents avec le style choisi. Mentionne dans chaque prompt les matériaux et textures spécifiques au style.` : ''}
${avoidClause}

STRUCTURE OBLIGATOIRE pour chaque objet (respecte-la à la lettre) :

1. "title" : Le titre numéroté de l'objet au format "Nom de l'objet (couleur principale + matériau ou couleur secondaire)"
   Exemples : "Canapé modulable bas (pale apricot + crème)", "Fauteuil club compact (seafoam green + noyer)"

2. "colors" : Les couleurs et matériaux entre parenthèses du titre
   Exemples : "pale apricot + crème", "seafoam green + noyer"

3. "prompt" : Le texte complet du prompt en suivant EXACTEMENT ce modèle :
   "Génère une planche produit montrant [article défini] [nom objet] d'intérieur, [DESCRIPTION STRUCTURELLE PRÉCISE — voir règles ci-dessous]. Important : crée un design 100% original et générique ; l'IA ne doit en aucun cas reproduire, imiter ou s'inspirer trop fidèlement d'un meuble/produit déjà existant (marques, modèles, designs reconnaissables). Affiche l'objet entièrement visible sous 3 vues distinctes : de face, de côté (profil droit) et de derrière, côte à côte et à la même échelle, rendu photoréaliste, éclairage studio neutre, fond blanc uniforme sans éléments décoratifs, sans ombres dures, sans logo, sans humains. Sous les 3 vues, inscris les dimensions réelles au format : Longueur (cm) x Profondeur (cm) x Hauteur (cm) : [dimensions]."

4. "dimensions" : Les dimensions réalistes L x P x H en cm (valeurs crédibles pour le type d'objet)

RÈGLES CRITIQUES POUR LA DESCRIPTION DANS LE PROMPT :
La description physique de chaque objet doit être STRUCTURELLE et PRÉCISE pour garantir la cohérence des 3 vues générées.
Pour chaque objet, OBLIGATOIREMENT mentionner :
- La FORME GÉOMÉTRIQUE EXACTE du corps (rectangulaire arrondi, cylindrique, ovale, cubique, trapézoïdal, etc.)
- Le NOMBRE EXACT d'éléments structurels : "4 pieds fuselés", "2 tiroirs", "3 étagères", "1 porte", "2 accoudoirs", "6 coussins"
- Le TYPE DE BASE/PIÈTEMENT : "4 pieds cylindriques en bois", "base monobloc rectangulaire", "socle métallique en X", "sans pieds, posé au sol"
- Les MATÉRIAUX avec leur FINITION : "chêne clair mat", "laiton brossé", "lin lavé", "métal noir satiné", "verre cannelé transparent"
- La COULEUR PRINCIPALE et la COULEUR SECONDAIRE
- La FORME des BORDS : "arêtes arrondies", "angles droits nets", "bords biseautés"

Exemples de BONNES descriptions :
✅ "un canapé 3 places de forme rectangulaire aux coins arrondis, 4 pieds cylindriques en chêne clair mat, revêtement en bouclette ivoire, 3 coussins d'assise fixes et 3 coussins de dossier souples, 2 accoudoirs bas et arrondis"
✅ "un buffet enfilade rectangulaire à 4 portes battantes en noyer teinté brun cacao, 4 poignées encastrées en laiton brossé, plateau affleurant, 4 pieds fuselés en métal doré satiné de 12cm"

Exemples de MAUVAISES descriptions (trop vagues, causent des incohérences) :
❌ "un beau canapé confortable en tissu clair avec un style moderne"
❌ "un buffet élégant en bois avec des détails dorés"

RÈGLES CRÉATIVES :
- Chaque objet doit être unique et cohérent avec la saison/collection
- Utiliser des noms de couleurs évocateurs en anglais (seafoam, butter yellow, pale blue, soft coral, sage green, lavender mist, melon, kiwi green, terracotta pale, etc.)
- Mentionner des matériaux variés : bois (noyer, chêne clair, white oak), métal (laiton, chrome), pierre (travertin), verre (clair, fumé, cannelé), textile (bouclette, lin, tressé)
- Les dimensions doivent être réalistes et précises pour chaque type d'objet
- Varier les styles descriptifs : "style contemporain décontracté", "lignes nettes", "allure lumineuse et saisonnière", "design pratique", etc.

RÈGLE CRITIQUE D'ENCODAGE :
- Tous les textes DOIVENT utiliser les caractères accentués français corrects : é, è, ê, ë, à, â, ù, û, ô, î, ï, ç, etc.
- Ne JAMAIS remplacer les accents par des chiffres ou les supprimer.
- Exemples corrects : "Génère", "canapé", "intérieur", "côté", "côte à côte", "même", "échelle", "photoréaliste", "éclairage", "éléments", "décoratifs", "bibliothèque", "étagères"
- Si le modèle de prompt contient "Génère une planche produit", le mot DOIT être "Génère" avec l'accent.`;

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
      // Re-number and fix accents
      items.forEach((item, idx) => {
        item.number = startNum + idx;
        item.title = fixAccents(item.title);
        item.prompt = fixAccents(item.prompt);
        item.colors = fixAccents(item.colors);
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
