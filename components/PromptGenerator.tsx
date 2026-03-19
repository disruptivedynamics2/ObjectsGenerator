import React, { useState } from 'react';
import { Sparkles, Loader2, Download, FileText, ChevronDown, ChevronUp, Palette } from 'lucide-react';
import { generateAndDownloadPrompts, GeneratedPromptItem, PromptGenerationConfig } from '../services/promptGeneratorService';
import { DESIGN_STYLES, DesignStyle } from '../services/stylesData';

interface PromptGeneratorProps {
  onPromptsGenerated?: (textContent: string) => void;
}

// Object types pool for random generation
const INTERIOR_OBJECTS = [
  { name: 'canapés', weight: 3 },
  { name: 'fauteuils', weight: 2 },
  { name: 'tables basses', weight: 2 },
  { name: 'tables de repas', weight: 1 },
  { name: 'tables d\'appoint', weight: 1 },
  { name: 'buffets', weight: 1 },
  { name: 'commodes', weight: 1 },
  { name: 'bibliothèques', weight: 1 },
  { name: 'meubles TV', weight: 1 },
  { name: 'consoles', weight: 1 },
  { name: 'bureaux', weight: 1 },
  { name: 'chaises', weight: 2 },
  { name: 'tabourets', weight: 1 },
  { name: 'lampes de table', weight: 1 },
  { name: 'suspensions', weight: 1 },
  { name: 'lampadaires', weight: 1 },
  { name: 'miroirs', weight: 1 },
  { name: 'poufs', weight: 1 },
  { name: 'étagères murales', weight: 1 },
  { name: 'tables de chevet', weight: 1 },
  { name: 'vases décoratifs', weight: 1 },
  { name: 'banquettes', weight: 1 },
];

const OUTDOOR_OBJECTS = [
  { name: 'canapés d\'extérieur', weight: 2 },
  { name: 'fauteuils de jardin', weight: 2 },
  { name: 'tables de jardin', weight: 2 },
  { name: 'chaises longues', weight: 1 },
  { name: 'parasols', weight: 1 },
  { name: 'jardinières', weight: 1 },
  { name: 'lanternes d\'extérieur', weight: 1 },
  { name: 'tables d\'appoint outdoor', weight: 1 },
  { name: 'bancs de jardin', weight: 1 },
  { name: 'poufs d\'extérieur', weight: 1 },
];

/**
 * Generates a random distribution of furniture types that sums to `total`.
 */
const generateRandomMix = (total: number, isOutdoor: boolean): string => {
  const pool = isOutdoor ? OUTDOOR_OBJECTS : INTERIOR_OBJECTS;

  // Pick a random subset of types (between 4 and 8, or fewer if total is small)
  const maxTypes = Math.min(pool.length, Math.max(3, Math.min(8, Math.ceil(total / 2))));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, maxTypes);

  // Distribute quantities using weighted random
  const totalWeight = selected.reduce((sum, s) => sum + s.weight, 0);
  let remaining = total;
  const distribution: { name: string; qty: number }[] = [];

  for (let i = 0; i < selected.length; i++) {
    const isLast = i === selected.length - 1;
    if (isLast) {
      distribution.push({ name: selected[i].name, qty: Math.max(1, remaining) });
    } else {
      const share = Math.round((selected[i].weight / totalWeight) * total);
      const qty = Math.max(1, Math.min(share, remaining - (selected.length - i - 1)));
      distribution.push({ name: selected[i].name, qty });
      remaining -= qty;
    }
  }

  // Shuffle the final order for variety
  distribution.sort(() => Math.random() - 0.5);

  return distribution.map(d => `${d.qty} ${d.name}`).join(', ');
};

const PRESET_SEASONS = [
  'Printemps-Été 2026',
  'Automne-Hiver 2026',
  'Été 2026',
  'Collection permanente',
];

// Group styles by field for the dropdown
const STYLE_GROUPS = [
  { label: 'Intérieur', styles: DESIGN_STYLES.filter(s => s.field === 'Intérieur') },
  { label: 'Intérieur / mixte', styles: DESIGN_STYLES.filter(s => s.field === 'Intérieur / mixte') },
  { label: 'Intérieur / extérieur', styles: DESIGN_STYLES.filter(s => s.field.includes('extérieur') && s.field.includes('Intérieur') && s.field !== 'Intérieur / mixte') },
  { label: 'Extérieur', styles: DESIGN_STYLES.filter(s => s.field === 'Extérieur') },
  { label: 'Extérieur / mixte', styles: DESIGN_STYLES.filter(s => s.field === 'Extérieur / mixte') },
  { label: 'Architecture', styles: DESIGN_STYLES.filter(s => s.field.includes('architecture')) },
].filter(g => g.styles.length > 0);

export const PromptGenerator: React.FC<PromptGeneratorProps> = ({ onPromptsGenerated }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedItems, setGeneratedItems] = useState<GeneratedPromptItem[] | null>(null);
  const [generatedText, setGeneratedText] = useState<string>('');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [theme, setTheme] = useState('');
  const [season, setSeason] = useState(PRESET_SEASONS[0]);
  const [count, setCount] = useState(30);
  const [style, setStyle] = useState('');
  const [colorPalette, setColorPalette] = useState('');
  const [objectTypes, setObjectTypes] = useState('');
  const [selectedDesignStyle, setSelectedDesignStyle] = useState<DesignStyle | null>(null);

  const handleDesignStyleChange = (styleId: string) => {
    if (styleId === '') {
      setSelectedDesignStyle(null);
      // Don't clear the fields — let user keep custom values
      return;
    }
    const ds = DESIGN_STYLES.find(s => s.id === parseInt(styleId));
    if (ds) {
      setSelectedDesignStyle(ds);
      // Auto-fill the fields from the style data
      setStyle(`${ds.name} — ${ds.description.substring(0, 120)}`);
      setColorPalette(ds.palette);
      setObjectTypes(ds.objectTypes);
    }
  };

  const handleGenerate = async () => {
    if (!theme) {
      setError('Veuillez choisir ou saisir un thème.');
      return;
    }

    setIsGenerating(true);
    setError(null);
    setGeneratedItems(null);

    try {
      const config: PromptGenerationConfig = {
        theme,
        season,
        count,
        ...(style && { style }),
        ...(colorPalette && { colorPalette }),
        ...(objectTypes && { objectTypes }),
        // Pass extra style context if a design style is selected
        ...(selectedDesignStyle && {
          styleContext: `Style de référence: ${selectedDesignStyle.name}. Matériaux dominants: ${selectedDesignStyle.materials}. Mots-clés visuels: ${selectedDesignStyle.promptModifiers}. Les objets doivent respecter les codes visuels de ce style.`
        }),
      };

      const result = await generateAndDownloadPrompts(config, (current, total) => {
        setProgress({ current, total });
      });

      setGeneratedItems(result.items);
      setGeneratedText(result.textContent);
      setProgress(null);
      onPromptsGenerated?.(result.textContent);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erreur lors de la génération des prompts.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadTxt = () => {
    if (!generatedText) return;
    const blob = new Blob([generatedText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTheme = theme.replace(/[^a-z0-9àâäéèêëïîôùûüÿçœæ\s-]/gi, '_').substring(0, 30);
    a.download = `prompts_${safeTheme}_${count}items.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUseInApp = () => {
    if (!generatedText) return;
    const blob = new Blob([generatedText], { type: 'text/plain' });
    const file = new File([blob], 'generated_prompts.txt', { type: 'text/plain' });
    window.dispatchEvent(new CustomEvent('promptsFileGenerated', { detail: { file } }));
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      {/* Header / Toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-violet-100 rounded-lg">
            <Sparkles className="w-5 h-5 text-violet-600" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-slate-900">Générateur de prompts</h3>
            <p className="text-xs text-slate-500">Créer automatiquement un fichier de prompts structurés</p>
          </div>
        </div>
        {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
      </button>

      {isExpanded && (
        <div className="px-5 pb-5 border-t border-slate-100 pt-5 space-y-5">

          {/* Design Style Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Palette className="w-4 h-4 inline mr-1.5 text-violet-500" />
              Style de design US 2026
            </label>
            <select
              value={selectedDesignStyle?.id?.toString() || ''}
              onChange={e => handleDesignStyleChange(e.target.value)}
              className="w-full px-3 py-2.5 border border-violet-200 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent bg-violet-50"
            >
              <option value="">Aucun style prédéfini (libre)</option>
              {STYLE_GROUPS.map(group => (
                <optgroup key={group.label} label={`── ${group.label} ──`}>
                  {group.styles.map(s => (
                    <option key={s.id} value={s.id.toString()}>
                      {s.name} — {s.signal}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>

            {/* Style preview card */}
            {selectedDesignStyle && (
              <div className="mt-3 bg-gradient-to-r from-violet-50 to-purple-50 border border-violet-100 rounded-xl p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-violet-900">{selectedDesignStyle.name}</h4>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    selectedDesignStyle.signal === 'Très fort' ? 'bg-green-100 text-green-700' :
                    selectedDesignStyle.signal === 'Fort' ? 'bg-blue-100 text-blue-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>{selectedDesignStyle.signal}</span>
                </div>
                <p className="text-xs text-violet-700 leading-relaxed">{selectedDesignStyle.description}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <span className="text-[10px] font-medium text-violet-600 bg-violet-100 px-2 py-0.5 rounded-full">
                    Palette: {selectedDesignStyle.palette}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-[10px] font-medium text-purple-600 bg-purple-100 px-2 py-0.5 rounded-full">
                    Matériaux: {selectedDesignStyle.materials}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Theme — free text */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Description des meubles souhaités</label>
            <textarea
              value={theme}
              onChange={e => setTheme(e.target.value)}
              placeholder="Ex: 5 canapés, 3 tables basses, 2 buffets, 5 luminaires, 3 fauteuils, 2 bibliothèques..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
            />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-slate-400">Précisez les types de meubles et leurs quantités.</p>
              <button
                type="button"
                onClick={() => {
                  const isOutdoor = selectedDesignStyle?.field?.toLowerCase().includes('extérieur') || false;
                  setTheme(generateRandomMix(count, isOutdoor));
                }}
                className="inline-flex items-center px-3 py-1 bg-violet-100 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-200 transition-colors"
              >
                🎲 Random
              </button>
            </div>
          </div>

          {/* Season + Count row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Saison / Collection</label>
              <select
                value={season}
                onChange={e => setSeason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              >
                {PRESET_SEASONS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Nombre de prompts</label>
              <input
                type="number"
                value={count}
                onChange={e => setCount(Math.max(1, Math.min(100, parseInt(e.target.value) || 1)))}
                min={1}
                max={100}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Optional fields — auto-filled by design style but still editable */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Style directeur {selectedDesignStyle && <span className="text-violet-500">(auto)</span>}
              </label>
              <input
                type="text"
                value={style}
                onChange={e => setStyle(e.target.value)}
                placeholder="Ex: contemporain décontracté"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Palette couleurs {selectedDesignStyle && <span className="text-violet-500">(auto)</span>}
              </label>
              <input
                type="text"
                value={colorPalette}
                onChange={e => setColorPalette(e.target.value)}
                placeholder="Ex: pastels lumineux"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">
                Types d'objets {selectedDesignStyle && <span className="text-violet-500">(auto)</span>}
              </label>
              <input
                type="text"
                value={objectTypes}
                onChange={e => setObjectTypes(e.target.value)}
                placeholder="Ex: canapés, tables, luminaires"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={isGenerating || !theme}
            className="w-full py-3 px-6 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700 disabled:from-slate-300 disabled:to-slate-300 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-violet-500/25 flex items-center justify-center gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Génération en cours... {progress ? `(${progress.current}/${progress.total})` : ''}
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5" />
                Générer {count} prompts {selectedDesignStyle ? `(${selectedDesignStyle.name})` : ''}
              </>
            )}
          </button>

          {/* Results */}
          {generatedItems && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="font-bold text-slate-900">{generatedItems.length} prompts générés</p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDownloadTxt}
                    className="inline-flex items-center px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> .TXT
                  </button>
                  <button
                    onClick={handleUseInApp}
                    className="inline-flex items-center px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5 mr-1.5" /> Utiliser dans l'app
                  </button>
                </div>
              </div>

              {/* Preview of first 3 items */}
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {generatedItems.slice(0, 3).map(item => (
                  <div key={item.number} className="bg-white rounded-lg p-3 border border-slate-200">
                    <p className="font-bold text-sm text-slate-900">{item.number}) {item.title}</p>
                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{item.prompt}</p>
                    <p className="text-xs text-slate-400 mt-1">Dimensions : {item.dimensions}</p>
                  </div>
                ))}
                {generatedItems.length > 3 && (
                  <p className="text-xs text-slate-400 text-center">... et {generatedItems.length - 3} autres prompts</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
