import React, { useEffect, useState } from 'react';
import { KeyRound, Eye, EyeOff, ExternalLink } from 'lucide-react';

interface ApiKeySelectorProps {
  onKeySelected: () => void;
}

export const ApiKeySelector: React.FC<ApiKeySelectorProps> = ({ onKeySelected }) => {
  const [checking, setChecking] = useState(true);
  const [manualKey, setManualKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const checkKey = async () => {
    // 1. Check if running inside AI Studio
    if (window.aistudio && window.aistudio.hasSelectedApiKey) {
      const hasKey = await window.aistudio.hasSelectedApiKey();
      if (hasKey) {
        onKeySelected();
        return;
      }
    }

    // 2. Check environment variable
    if (process.env.API_KEY) {
      onKeySelected();
      return;
    }

    setChecking(false);
  };

  useEffect(() => {
    checkKey();
  }, []);

  const handleSelectAIStudioKey = async () => {
    if (window.aistudio && window.aistudio.openSelectKey) {
      await window.aistudio.openSelectKey();
      onKeySelected();
    }
  };

  const handleManualKeySubmit = async () => {
    const trimmedKey = manualKey.trim();
    if (!trimmedKey) {
      setError('Veuillez entrer une clé API.');
      return;
    }

    if (!trimmedKey.startsWith('AIza')) {
      setError('Le format de la clé API semble incorrect. Elle devrait commencer par "AIza".');
      return;
    }

    setIsValidating(true);
    setError('');

    try {
      // Validate the key with a lightweight request
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${trimmedKey}`
      );

      if (!response.ok) {
        throw new Error('Clé API invalide ou expirée.');
      }

      // Store the key in the process.env equivalent for the app
      (window as any).__GEMINI_API_KEY__ = trimmedKey;
      // Override process.env.API_KEY for the session
      (process.env as any).API_KEY = trimmedKey;
      (process.env as any).GEMINI_API_KEY = trimmedKey;

      onKeySelected();
    } catch (err: any) {
      setError(err.message || 'Impossible de valider la clé API.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleManualKeySubmit();
    }
  };

  if (checking) return null;

  const hasAIStudio = !!(window.aistudio && window.aistudio.openSelectKey);

  return (
    <div className="fixed inset-0 bg-slate-900/90 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <KeyRound className="w-8 h-8 text-indigo-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Accès API Requis</h2>
          <p className="text-slate-600 text-sm">
            Entrez votre clé API Gemini pour générer des images haute résolution.
          </p>
        </div>

        {/* Manual API Key Input */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Clé API Gemini
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={manualKey}
                onChange={(e) => { setManualKey(e.target.value); setError(''); }}
                onKeyDown={handleKeyDown}
                placeholder="AIza..."
                className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent pr-12 text-sm font-mono"
                autoFocus
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                type="button"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            onClick={handleManualKeySubmit}
            disabled={isValidating || !manualKey.trim()}
            className="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-all shadow-lg hover:shadow-indigo-500/25 flex items-center justify-center gap-2"
          >
            {isValidating ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Validation...
              </>
            ) : (
              'Valider la clé API'
            )}
          </button>
        </div>

        {/* AI Studio fallback */}
        {hasAIStudio && (
          <>
            <div className="flex items-center gap-3 my-6">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium uppercase">ou</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
            <button
              onClick={handleSelectAIStudioKey}
              className="w-full py-3 px-6 bg-white border-2 border-slate-200 hover:border-indigo-500 text-slate-700 hover:text-indigo-600 font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
            >
              Sélectionner via AI Studio
            </button>
          </>
        )}

        <p className="mt-6 text-xs text-slate-400 text-center">
          Obtenez une clé sur{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-indigo-600 inline-flex items-center gap-1"
          >
            Google AI Studio <ExternalLink className="w-3 h-3" />
          </a>
          . Votre clé n'est jamais envoyée à un serveur tiers.
        </p>
      </div>
    </div>
  );
};
