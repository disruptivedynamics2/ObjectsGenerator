# Guide d'installation ComfyUI pour ObjectsGenerator

## Prérequis
- ComfyUI Studio installé et fonctionnel
- RTX 4090 (24GB VRAM) — parfait pour tous les modèles ci-dessous
- ComfyUI Manager installé (pour les custom nodes)

## Étape 1 : Vérifier le port de ComfyUI

Lancez ComfyUI Studio. Dans la console, cherchez une ligne comme :
```
Starting server on http://0.0.0.0:8188
```
L'app ObjectsGenerator se connecte par défaut sur `localhost:8188`.

---

## Modèle 1 : Flux 2 + Multi-Angles LoRA (Recommandé)

**Meilleure qualité photoréaliste. Le LoRA est spécialement entraîné pour générer des planches multi-angles.**

### Fichiers à télécharger :

1. **Checkpoint Flux 1 Dev FP8**
   - URL : https://huggingface.co/Comfy-Org/flux1-dev/blob/main/flux1-dev-fp8.safetensors
   - Destination : `ComfyUI/models/checkpoints/flux1-dev-fp8.safetensors`
   - Taille : ~11 GB

2. **LoRA Multi-Angles v2**
   - URL : https://huggingface.co/lovis93/Flux-2-Multi-Angles-LoRA-v2
   - Destination : `ComfyUI/models/loras/Flux-2-Multi-Angles-LoRA-v2.safetensors`
   - Taille : ~200 MB

### Custom nodes requis : Aucun (nodes standard ComfyUI)

---

## Modèle 2 : SDXL + MV-Adapter

**Multi-view dédié. Génère front/right/back avec cohérence structurelle garantie.**

### Fichiers à télécharger :

1. **Checkpoint SDXL Base 1.0**
   - URL : https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0
   - Destination : `ComfyUI/models/checkpoints/sd_xl_base_1.0.safetensors`
   - Taille : ~6.5 GB

2. **MV-Adapter SDXL LDM** (téléchargement auto via le custom node)

### Custom node requis :

Dans ComfyUI Manager → Install Custom Nodes → Chercher "MVAdapter" ou installer manuellement :
```
cd ComfyUI/custom_nodes
git clone https://github.com/huanngzh/ComfyUI-MVAdapter
cd ComfyUI-MVAdapter
pip install -r requirements.txt
```
Redémarrer ComfyUI après l'installation.

---

## Modèle 3 : Qwen-Image-Edit

**Édition guidée par référence. Idéal en mode haute cohérence (pass 2).**

### Installation :

Option A — Via ComfyUI natif (si votre version le supporte) :
- Le modèle se télécharge automatiquement au premier usage

Option B — Via custom node :
```
cd ComfyUI/custom_nodes
git clone https://github.com/lrzjason/Comfyui-QwenEditUtils
pip install -r requirements.txt
```

### Fichiers modèle :
- URL : https://huggingface.co/Qwen/Qwen-Image-Edit-2511
- Le téléchargement est automatique au premier lancement

---

## Test rapide

1. Lancez ComfyUI Studio
2. Lancez ObjectsGenerator (`npm run dev`)
3. Dans ObjectsGenerator, sélectionnez **ComfyUI (Local)** comme backend
4. Si le badge vert "ComfyUI connecté" apparaît, tout est prêt
5. Sélectionnez un preset (ex: Flux 2 + Multi-Angles LoRA)
6. Lancez une génération

## Dépannage

- **"ComfyUI non détecté"** → Vérifiez que ComfyUI Studio est lancé et tourne sur le port 8188
- **"Workflow rejected"** → Un modèle ou custom node manque. Vérifiez l'installation ci-dessus
- **Images noires/vides** → Le modèle n'est peut-être pas complètement téléchargé. Vérifiez la taille du fichier
