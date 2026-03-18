import React, { useState } from 'react';
import { Sparkles, Loader2, Download, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { generateAndDownloadPrompts, GeneratedPromptItem, PromptGenerationConfig } from '../services/promptGeneratorService';

interface PromptGeneratorProps {
  onPromptsGenerated?: (textContent: string) => void;
}

const PRESET_THEMES = [
  { label: 'Intérieur coloré', value: 'objets et meubles d\'intérieur colorés' },
  { label: 'Mobilier outdoor', value: 'meubles et accessoires d\'extérieur / jardin' },
  { label: 'Luminaires design', value: 'luminaires et lampes design d\'intérieur' },
  { label: 'Accessoires déco', value: 'accessoires et objets de décoration d\'intérieur' },
  { label: 'Mobilier bureau', value: 'meubles et accessoires de bureau / workspace' },
  { label: 'Personnalisé', value: '' },
];

const PRESET_SEASONS = [
  'Printemps-Été 2026',
  'Automne-Hiver 2026',
  'Été 2026',
  'Collection permanente',
];

export const PromptGenerator: React.FC<PromptGeneratorProps> = ({ onPromptsGenerated }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedItems, setGeneratedItems] = useState<GeneratedPromptItem[] | null>(null);
  const [generatedText, setGeneratedText] = useState<string>('');
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [selectedThemePreset, setSelectedThemePreset] = useState(PRESET_THEMES[0].value);
  const [customTheme, setCustomTheme] = useState('');
  const [season, setSeason] = useState(PRESET_SEASONS[0]);
  const [count, setCount] = useState(30);
  const [style, setStyle] = useState('');
  const [colorPalette, setColorPalette] = useState('');
  const [objectTypes, setObjectTypes] = useState('');

  const theme = selectedThemePreset || customTheme;

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
    // Create a Blob and a File to feed into the existing file upload flow
    const blob = new Blob([generatedText], { type: 'text/plain' });
    const file = new File([blob], 'generated_prompts.txt', { type: 'text/plain' });

    // Dispatch a custom event that App.tsx can listen to
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
          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Thème</label>
            <div className="flex flex-wrap gap-2 mb-2">
              {PRESET_THEMES.map(t => (
                <button
                  key={t.label}
                  onClick={() => setSelectedThemePreset(t.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    selectedThemePreset === t.value
                      ? 'bg-violet-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            {selectedThemePreset === '' && (
              <input
                type="text"
                value={customTheme}
                onChange={e => setCustomTheme(e.target.value)}
                placeholder="Ex: meubles scandinaves en bois et lin..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            )}
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

          {/* Optional fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Style (optionnel)</label>
              <input
                type="text"
                value={style}
                onChange={e => setStyle(e.target.value)}
                placeholder="Ex: contemporain décontracté"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Palette couleurs (optionnel)</label>
              <input
                type="text"
                value={colorPalette}
                onChange={e => setColorPalette(e.target.value)}
                placeholder="Ex: pastels lumineux"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Types d'objets (optionnel)</label>
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
                Générer {count} prompts
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
