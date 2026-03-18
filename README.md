# Objects Generator — Générateur d'Images IA Multi-Vues

Application React qui transforme des fichiers de prompts (PDF, DOCX, TXT) en visuels haute résolution multi-vues (face, profil, arrière) grâce aux modèles Gemini de Google.

## Fonctionnalités

- **Import multi-formats** : PDF, DOCX et TXT avec drag & drop
- **Analyse IA automatique** : Extraction et structuration des prompts par Gemini
- **Génération 3 vues** : Triptych orthographique cohérent (face 0°, profil 90°, arrière 180°)
- **2 modèles** : Nano Banana 2 (Flash 3.1, rapide) et Nano Banana Pro (Pro 3, haute qualité)
- **4 résolutions** : 512px, 1K, 2K, 4K
- **Mode temps réel** : Génération image par image avec aperçu instantané
- **Mode batch différé** : Soumission via l'API Batch (-50% sur le coût), résultats sous 24h
- **Export** : ZIP et PDF catalogue avec vues annotées
- **Google Drive** : Upload automatique des résultats via OAuth2
- **Estimation des coûts** : Calcul en temps réel basé sur les tarifs officiels Google

## Tarifs API (mars 2026)

| Modèle | 512px | 1K | 2K | 4K |
|--------|-------|-------|-------|-------|
| Nano Banana 2 (Flash 3.1) | $0.045 | $0.067 | $0.101 | $0.151 |
| Nano Banana Pro (Pro 3) | $0.134 | $0.134 | $0.134 | $0.240 |

Le mode batch divise ces prix par 2.

## Installation

```bash
# Cloner le repo
git clone https://github.com/VOTRE_USER/objects-generator.git
cd objects-generator

# Installer les dépendances
npm install

# Configurer les variables d'environnement
cp .env.example .env.local
# Éditez .env.local avec votre clé API Gemini
```

## Configuration

Copiez `.env.example` en `.env.local` et renseignez :

- **`GEMINI_API_KEY`** (obligatoire) : Votre clé API Gemini depuis [Google AI Studio](https://aistudio.google.com/apikey)
- **`GOOGLE_CLIENT_ID`** (optionnel) : Pour l'intégration Google Drive. Créez un OAuth Client ID sur [Google Cloud Console](https://console.cloud.google.com/apis/credentials) avec l'API Drive activée.

Si aucune clé n'est configurée en variable d'environnement, l'application propose une saisie manuelle au lancement.

## Utilisation

```bash
# Mode développement
npm run dev

# Build production
npm run build

# Prévisualiser le build
npm run preview
```

## Architecture

```
├── App.tsx                    # Composant principal (UI + logique d'état)
├── types.ts                   # Types TypeScript partagés
├── components/
│   └── ApiKeySelector.tsx     # Écran de saisie/sélection de clé API
├── services/
│   ├── geminiService.ts       # Analyse de prompts + génération d'images
│   ├── batchService.ts        # Mode batch (ai.batches.create, polling)
│   ├── driveService.ts        # Intégration Google Drive OAuth2
│   ├── fileService.ts         # Extraction de texte (PDF, DOCX, TXT)
│   └── exportService.ts       # Export ZIP + PDF catalogue
├── index.html                 # Point d'entrée HTML
├── index.tsx                  # Point d'entrée React
├── vite.config.ts             # Configuration Vite
└── .env.example               # Template des variables d'environnement
```

## Technologies

- React 19 + TypeScript
- Vite 6
- Tailwind CSS (CDN)
- Google Gemini API (@google/genai)
- PDF.js, JSZip, jsPDF, Mammoth.js

## Licence

MIT
