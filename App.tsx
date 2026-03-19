
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Upload, FileText, Image as ImageIcon, Download, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Layers, PlayCircle, Monitor, Tv, Zap, FileCode, Clock, CloudUpload, Timer } from 'lucide-react';
import { extractTextFromFile } from './services/fileService';
import { analyzePdfContent, generateImageForPrompt } from './services/geminiService';
import { downloadZip, downloadPdf, downloadGlobalZip, downloadMergedPdf, generateMergedPdfBlob } from './services/exportService';
import { createBatchJob, createHighCoherenceBatchJob, pollBatchJob, cancelBatchJob } from './services/batchService';
import { authenticateGoogleDrive, isDriveAuthenticated, uploadBatchResultsToDrive } from './services/driveService';
import { verifyAllImages, filterConsistentImages, VerificationResult } from './services/viewVerificationService';
import { backupBatchJob, restoreBatchJob, restoreBatchFromFile, hasBatchBackup, clearBatchBackup } from './services/batchPersistenceService';
import { getBatchJobStatus, getBatchJobResults } from './services/batchService';
import { ApiKeySelector } from './components/ApiKeySelector';
import { PromptGenerator } from './components/PromptGenerator';
import { PromptGroup, GeneratedImage, AppState, ImageSize, ImageModel, GenerationMode, BatchJob, BatchJobState } from './types';

// Pricing per image (verified from official Google API docs)
const PRICING = {
  'gemini-3.1-flash-image-preview': {
    '512px': 0.045,
    '1K': 0.067,
    '2K': 0.101,
    '4K': 0.151,
  },
  'gemini-3-pro-image-preview': {
    '512px': 0.134,
    '1K': 0.134,
    '2K': 0.134,
    '4K': 0.240,
  }
};

const BATCH_DISCOUNT = 0.5; // 50% discount for batch mode

const App: React.FC = () => {
  const [appState, setAppState] = useState<AppState>(AppState.IDLE);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [groups, setGroups] = useState<PromptGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<PromptGroup | null>(null);
  const [selectedResolution, setSelectedResolution] = useState<ImageSize>('4K');
  const [selectedModel, setSelectedModel] = useState<ImageModel>('gemini-3.1-flash-image-preview');
  const [generationMode, setGenerationMode] = useState<GenerationMode>('realtime');
  const [highCoherence, setHighCoherence] = useState(true);

  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [allGeneratedImages, setAllGeneratedImages] = useState<GeneratedImage[]>([]);

  const [progress, setProgress] = useState<{ current: number; total: number; status: string; groupName?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Batch mode state
  const [activeBatchJob, setActiveBatchJob] = useState<BatchJob | null>(null);
  const [batchProgress, setBatchProgress] = useState<{ state: BatchJobState; completed: number; failed: number } | null>(null);

  // Drive state
  const [driveLink, setDriveLink] = useState<string | null>(null);
  const [driveUploadProgress, setDriveUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const [driveAutoStatus, setDriveAutoStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');

  // Verification state
  const [verificationResults, setVerificationResults] = useState<VerificationResult[]>([]);
  const [verificationProgress, setVerificationProgress] = useState<{ current: number; total: number; currentItem: string } | null>(null);
  const [rejectedImages, setRejectedImages] = useState<GeneratedImage[]>([]);

  // Batch backup state
  const [hasBackup, setHasBackup] = useState(hasBatchBackup());
  const [isRestoring, setIsRestoring] = useState(false);

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const backupFileInputRef = useRef<HTMLInputElement>(null);

  // Listen for generated prompts from the PromptGenerator component
  useEffect(() => {
    const handler = (event: Event) => {
      const customEvent = event as CustomEvent<{ file: File }>;
      if (customEvent.detail?.file) {
        processFile(customEvent.detail.file);
      }
    };
    window.addEventListener('promptsFileGenerated', handler);
    return () => window.removeEventListener('promptsFileGenerated', handler);
  }, []);

  const calculateCost = useCallback((count: number) => {
    const perImage = PRICING[selectedModel][selectedResolution];
    const batchPerImage = perImage * BATCH_DISCOUNT;
    return {
      perImage,
      total: count * perImage,
      batchPerImage,
      batchTotal: count * batchPerImage,
      currency: '$'
    };
  }, [selectedModel, selectedResolution]);

  // --- File handling (click + drag & drop) ---

  const processFile = async (file: File) => {
    const allowedExtensions = ['pdf', 'docx', 'txt'];
    const extension = file.name.split('.').pop()?.toLowerCase() || '';

    if (!allowedExtensions.includes(extension)) {
      setError("Le fichier doit être au format PDF, DOCX ou TXT.");
      return;
    }

    try {
      setAppState(AppState.ANALYZING);
      setError(null);

      const text = await extractTextFromFile(file);
      const analyzedGroups = await analyzePdfContent(text);

      if (!analyzedGroups || analyzedGroups.length === 0) {
        throw new Error("Aucun prompt détecté dans le fichier. Assurez-vous qu'il contient du texte descriptif.");
      }

      setGroups(analyzedGroups);
      setAppState(AppState.SELECTING);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Une erreur est survenue lors de l'analyse du fichier.");
      setAppState(AppState.IDLE);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) await processFile(file);
  };

  const handleDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await processFile(file);
  };

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  // --- Realtime generation ---

  const [isStopping, setIsStopping] = useState(false);

  const stopGeneration = () => setIsStopping(true);

  const startSingleGeneration = async (group: PromptGroup) => {
    setSelectedGroup(group);
    setAppState(AppState.GENERATING);
    setGeneratedImages([]);
    setError(null);
    setIsStopping(false);

    const total = group.items.length;
    const images: GeneratedImage[] = [];

    try {
      for (let i = 0; i < total; i++) {
        if (isStopping) break;

        const item = group.items[i];
        setProgress({ current: i + 1, total, status: `Génération de "${item.name}"...` });

        let base64 = '';
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
          try {
            base64 = await generateImageForPrompt(item.prompt, selectedResolution, selectedModel, highCoherence);
            break;
          } catch (err: any) {
            attempts++;
            console.warn(`Attempt ${attempts} failed for ${item.name}`, err);
            if (err.message?.includes("Requested entity was not found")) throw err;
            if (attempts >= maxAttempts) {
              console.error(`Failed to generate image for ${item.name} after ${maxAttempts} attempts.`);
            } else {
              await new Promise(r => setTimeout(r, 2000 * attempts));
            }
          }
        }

        if (base64) {
          const newImg = { groupId: group.id, itemId: i, prompt: item.prompt, base64, resolution: selectedResolution };
          images.push(newImg);
          setGeneratedImages(prev => [...prev, newImg]);
        }
      }

      if (isStopping) {
        setAppState(AppState.SELECTING);
      } else {
        setAppState(AppState.FINISHED);
        setTimeout(() => { downloadZip(group, images); }, 500);
        setTimeout(() => { downloadPdf(group, images); }, 1500);
      }
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Requested entity was not found")) {
        setError("Clé API non valide ou projet non trouvé. Veuillez sélectionner à nouveau votre clé.");
        setHasApiKey(false);
      } else {
        setError("Erreur lors de la génération. Certains objets ont pu être ignorés.");
      }
      setAppState(AppState.SELECTING);
    } finally {
      setProgress(null);
      setIsStopping(false);
    }
  };

  const startGlobalGeneration = async () => {
    setAppState(AppState.GENERATING_ALL);
    setAllGeneratedImages([]);
    setError(null);
    setIsStopping(false);

    const totalItems = groups.reduce((acc, group) => acc + group.items.length, 0);
    let itemsProcessed = 0;
    const allImages: GeneratedImage[] = [];

    try {
      for (const group of groups) {
        for (let i = 0; i < group.items.length; i++) {
          if (isStopping) break;

          const item = group.items[i];
          itemsProcessed++;
          setProgress({ current: itemsProcessed, total: totalItems, status: `Génération de "${item.name}"...`, groupName: group.name });

          let base64 = '';
          let attempts = 0;
          const maxAttempts = 3;

          while (attempts < maxAttempts) {
            try {
              base64 = await generateImageForPrompt(item.prompt, selectedResolution, selectedModel, highCoherence);
              break;
            } catch (err: any) {
              attempts++;
              console.warn(`Attempt ${attempts} failed for ${item.name}`, err);
              if (err.message?.includes("Requested entity was not found")) throw err;
              if (attempts >= maxAttempts) {
                console.error(`Failed to generate image for ${item.name} after ${maxAttempts} attempts.`);
              } else {
                await new Promise(r => setTimeout(r, 2000 * attempts));
              }
            }
          }

          if (base64) {
            const newImg = { groupId: group.id, itemId: i, prompt: item.prompt, base64, resolution: selectedResolution };
            allImages.push(newImg);
            setAllGeneratedImages(prev => [...prev, newImg]);
          }
        }
        if (isStopping) break;
      }

      if (isStopping) {
        setAppState(AppState.SELECTING);
      } else {
        // Step 2: Verify image consistency
        setProgress({ current: 0, total: allImages.length, status: 'Vérification de la cohérence des vues...', groupName: '' });
        const verResults = await verifyAllImages(
          allImages,
          (img) => {
            const group = groups.find(g => g.id === img.groupId);
            return group?.items[img.itemId]?.name || `Image ${img.itemId}`;
          },
          (current, total, currentItem) => {
            setVerificationProgress({ current, total, currentItem });
            setProgress({ current, total, status: `Vérification: "${currentItem}"...`, groupName: 'Contrôle qualité' });
          }
        );

        setVerificationResults(verResults);
        setVerificationProgress(null);

        // Separate consistent and rejected images
        const { consistent, rejected } = filterConsistentImages(allImages, verResults);
        setRejectedImages(rejected);

        const rejectedCount = rejected.length;
        if (rejectedCount > 0) {
          setError(`${rejectedCount} image(s) rejetée(s) pour incohérence entre les vues. Elles sont exclues du catalogue PDF.`);
        }

        setAppState(AppState.FINISHED_ALL);

        // Step 3: Auto-download ZIP (all images) and PDF (only consistent ones)
        setTimeout(() => { downloadGlobalZip(groups, allImages); }, 500);
        if (consistent.length > 0) {
          setTimeout(() => { downloadMergedPdf(groups, consistent); }, 2000);
        }

        // Step 4: Auto-upload to Drive
        if (isDriveAuthenticated()) {
          await autoUploadToDrive(allImages, consistent);
        }
      }
    } catch (err: any) {
      console.error(err);
      if (err.message?.includes("Requested entity was not found")) {
        setError("Clé API non valide ou projet non trouvé. Veuillez sélectionner à nouveau votre clé.");
        setHasApiKey(false);
      } else {
        setError("Une erreur est survenue pendant la génération globale. Certains objets ont pu être ignorés.");
      }
      setAppState(AppState.SELECTING);
    } finally {
      setProgress(null);
      setIsStopping(false);
    }
  };

  // --- Batch mode ---

  const startBatchGeneration = async () => {
    setAppState(AppState.BATCH_SUBMITTED);
    setError(null);
    setDriveLink(null);

    try {
      let job: BatchJob;

      if (highCoherence) {
        // High Coherence batch: pre-generate reference images, then batch the 3-views
        setProgress({ current: 0, total: groups.reduce((a, g) => a + g.items.length, 0), status: 'Génération des images de référence...', groupName: 'Pass 1 — Références' });

        job = await createHighCoherenceBatchJob(
          groups, selectedResolution, selectedModel,
          (current, total, itemName) => {
            setProgress({ current, total, status: `Référence: "${itemName}" (${current}/${total})`, groupName: 'Pass 1 — Références' });
          }
        );

        setProgress(null);
      } else {
        // Standard batch
        job = await createBatchJob(groups, selectedResolution, selectedModel);
      }

      setActiveBatchJob(job);
      // Auto-backup the batch job for recovery after server restart
      backupBatchJob(job);
      setHasBackup(true);
      setAppState(AppState.BATCH_MONITORING);

      // Start polling
      const results = await pollBatchJob(
        job.name,
        (state, completed, failed) => {
          setBatchProgress({ state, completed, failed });
        },
        15000
      );

      // Convert results to GeneratedImage format
      const images: GeneratedImage[] = [];
      for (const group of groups) {
        for (let i = 0; i < group.items.length; i++) {
          const key = `g${group.id}_i${i}_${group.items[i].name.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}`;
          const base64 = results.get(key);
          if (base64) {
            images.push({
              groupId: group.id,
              itemId: i,
              prompt: group.items[i].prompt,
              base64,
              resolution: selectedResolution
            });
          }
        }
      }

      setAllGeneratedImages(images);

      // Verify image consistency
      const verResults = await verifyAllImages(
        images,
        (img) => {
          const group = groups.find(g => g.id === img.groupId);
          return group?.items[img.itemId]?.name || `Image ${img.itemId}`;
        },
        (current, total, currentItem) => {
          setVerificationProgress({ current, total, currentItem });
        }
      );

      setVerificationResults(verResults);
      setVerificationProgress(null);

      const { consistent, rejected } = filterConsistentImages(images, verResults);
      setRejectedImages(rejected);

      if (rejected.length > 0) {
        setError(`${rejected.length} image(s) rejetée(s) pour incohérence entre les vues.`);
      }

      setAppState(AppState.FINISHED_ALL);

      // Batch succeeded — clear backup
      clearBatchBackup();
      setHasBackup(false);

      // Auto-upload to Drive if authenticated
      if (isDriveAuthenticated() && images.length > 0) {
        await autoUploadToDrive(images, consistent);
      }

    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erreur lors du traitement batch.");
      setAppState(AppState.SELECTING);
    } finally {
      setBatchProgress(null);
    }
  };

  const handleCancelBatch = async () => {
    if (activeBatchJob) {
      try {
        await cancelBatchJob(activeBatchJob.name);
        clearBatchBackup();
        setHasBackup(false);
        setAppState(AppState.SELECTING);
        setActiveBatchJob(null);
        setBatchProgress(null);
      } catch (err: any) {
        setError("Impossible d'annuler le batch: " + err.message);
      }
    }
  };

  const handleBackupBatch = () => {
    if (activeBatchJob) {
      backupBatchJob(activeBatchJob);
      setHasBackup(true);
    }
  };

  const handleRestoreBatch = async () => {
    const backup = restoreBatchJob();
    if (!backup) {
      setError('Aucun batch sauvegardé trouvé.');
      return;
    }

    setIsRestoring(true);
    setError(null);

    try {
      const job = backup.job;

      // Check current status of the batch at Google
      const status = await getBatchJobStatus(job.name);

      // Restore groups so we can map results back
      setGroups(job.groups);
      setActiveBatchJob(job);
      setSelectedResolution(job.resolution);

      if (status.state === 'JOB_STATE_SUCCEEDED') {
        // Batch already finished — retrieve results directly
        setAppState(AppState.BATCH_MONITORING);
        setBatchProgress({ state: 'JOB_STATE_SUCCEEDED', completed: status.completedRequests, failed: status.failedRequests });

        const results = await getBatchJobResults(job.name);

        // Convert to GeneratedImage
        const images: GeneratedImage[] = [];
        for (const group of job.groups) {
          for (let i = 0; i < group.items.length; i++) {
            const key = `g${group.id}_i${i}_${group.items[i].name.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}`;
            const base64 = results.get(key);
            if (base64) {
              images.push({ groupId: group.id, itemId: i, prompt: group.items[i].prompt, base64, resolution: job.resolution });
            }
          }
        }

        setAllGeneratedImages(images);

        // Verify consistency
        const verResults = await verifyAllImages(
          images,
          (img) => {
            const g = job.groups.find(gr => gr.id === img.groupId);
            return g?.items[img.itemId]?.name || `Image ${img.itemId}`;
          },
          (current, total, currentItem) => setVerificationProgress({ current, total, currentItem })
        );
        setVerificationResults(verResults);
        setVerificationProgress(null);

        const { consistent, rejected } = filterConsistentImages(images, verResults);
        setRejectedImages(rejected);
        if (rejected.length > 0) {
          setError(`${rejected.length} image(s) rejetée(s) pour incohérence.`);
        }

        setAppState(AppState.FINISHED_ALL);
        clearBatchBackup();
        setHasBackup(false);

        // Auto-upload to Drive
        if (isDriveAuthenticated() && images.length > 0) {
          await autoUploadToDrive(images, consistent);
        }

      } else if (status.state === 'JOB_STATE_FAILED' || status.state === 'JOB_STATE_CANCELLED') {
        setError(`Le batch a échoué ou a été annulé (état: ${status.state}).`);
        clearBatchBackup();
        setHasBackup(false);
        setAppState(AppState.SELECTING);
      } else {
        // Still running — resume polling
        setAppState(AppState.BATCH_MONITORING);
        setBatchProgress({ state: status.state, completed: status.completedRequests, failed: status.failedRequests });

        const results = await pollBatchJob(
          job.name,
          (state, completed, failed) => setBatchProgress({ state, completed, failed }),
          15000
        );

        // Convert results
        const images: GeneratedImage[] = [];
        for (const group of job.groups) {
          for (let i = 0; i < group.items.length; i++) {
            const key = `g${group.id}_i${i}_${group.items[i].name.replace(/[^a-z0-9]/gi, '_').substring(0, 20)}`;
            const base64 = results.get(key);
            if (base64) {
              images.push({ groupId: group.id, itemId: i, prompt: group.items[i].prompt, base64, resolution: job.resolution });
            }
          }
        }

        setAllGeneratedImages(images);

        const verResults = await verifyAllImages(
          images,
          (img) => {
            const g = job.groups.find(gr => gr.id === img.groupId);
            return g?.items[img.itemId]?.name || `Image ${img.itemId}`;
          },
          (current, total, currentItem) => setVerificationProgress({ current, total, currentItem })
        );
        setVerificationResults(verResults);
        setVerificationProgress(null);

        const { consistent, rejected } = filterConsistentImages(images, verResults);
        setRejectedImages(rejected);
        if (rejected.length > 0) {
          setError(`${rejected.length} image(s) rejetée(s) pour incohérence.`);
        }

        setAppState(AppState.FINISHED_ALL);
        clearBatchBackup();
        setHasBackup(false);

        if (isDriveAuthenticated() && images.length > 0) {
          await autoUploadToDrive(images, consistent);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError("Erreur lors de la restauration du batch: " + err.message);
      setAppState(AppState.SELECTING);
    } finally {
      setIsRestoring(false);
      setBatchProgress(null);
    }
  };

  const handleRestoreFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result as string;
      const backup = restoreBatchFromFile(content);
      if (backup) {
        setHasBackup(true);
        // Immediately trigger the restore
        handleRestoreBatch();
      } else {
        setError('Fichier de backup invalide. Veuillez sélectionner un fichier batch_backup.json valide.');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  // --- Google Drive ---

  /**
   * Auto-uploads all images + PDF catalog (only consistent images) to Drive.
   * Called automatically after generation completes.
   */
  const autoUploadToDrive = async (allImages: GeneratedImage[], consistentImages: GeneratedImage[]) => {
    try {
      setDriveAutoStatus('uploading');

      const dateStr = new Date().toISOString().split('T')[0];
      const driveImages = allImages.map(img => {
        const group = groups.find(g => g.id === img.groupId);
        return {
          groupName: group?.name || `Groupe ${img.groupId}`,
          itemName: group?.items[img.itemId]?.name || `Image ${img.itemId}`,
          base64: img.base64,
        };
      });

      // Generate PDF catalog blob with ONLY consistent images
      let pdfBlob: Blob | undefined;
      try {
        if (consistentImages.length > 0) {
          const relevantGroups = groups.filter(g => consistentImages.some(img => img.groupId === g.id));
          pdfBlob = generateMergedPdfBlob(relevantGroups, consistentImages);
        }
      } catch (e) {
        console.warn('Could not generate PDF for Drive upload:', e);
      }

      const totalItems = driveImages.length + (pdfBlob ? 1 : 0);
      setDriveUploadProgress({ current: 0, total: totalItems });

      const commandName = `Generation_${dateStr}`;
      const link = await uploadBatchResultsToDrive(
        driveImages,
        commandName,
        (current, total) => setDriveUploadProgress({ current, total }),
        pdfBlob
      );

      setDriveLink(link);
      setDriveUploadProgress(null);
      setDriveAutoStatus('done');
    } catch (err: any) {
      console.error(err);
      setError("Erreur upload Drive: " + err.message);
      setDriveUploadProgress(null);
      setDriveAutoStatus('error');
    }
  };

  const handleConnectDrive = async () => {
    try {
      await authenticateGoogleDrive();
      // If we already have images, trigger auto-upload now
      if (allGeneratedImages.length > 0) {
        const { consistent } = filterConsistentImages(allGeneratedImages, verificationResults);
        await autoUploadToDrive(allGeneratedImages, consistent);
      }
    } catch (err: any) {
      setError(err.message);
    }
  };

  // --- Download handlers ---

  const handleDownloadZip = () => {
    if (selectedGroup && generatedImages.length > 0) downloadZip(selectedGroup, generatedImages);
  };

  const handleDownloadPdf = () => {
    if (selectedGroup && generatedImages.length > 0) downloadPdf(selectedGroup, generatedImages);
  };

  const handleDownloadGlobalZip = () => {
    if (groups.length > 0 && allGeneratedImages.length > 0) downloadGlobalZip(groups, allGeneratedImages);
  };

  const resetSelection = () => {
    setSelectedGroup(null);
    setGeneratedImages([]);
    setAllGeneratedImages([]);
    setDriveLink(null);
    setDriveAutoStatus('idle');
    setVerificationResults([]);
    setVerificationProgress(null);
    setRejectedImages([]);
    setAppState(AppState.SELECTING);
  };

  // --- Render ---

  if (!hasApiKey) return <ApiKeySelector onKeySelected={() => setHasApiKey(true)} />;

  const totalPrompts = groups.reduce((acc, g) => acc + g.items.length, 0);
  const costInfo = calculateCost(totalPrompts);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-12 max-w-2xl">
        <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl mb-4">
          Générateur d'Images IA
        </h1>
        <p className="text-lg text-slate-600">
          Transformez les prompts de vos fichiers PDF, DOCX ou TXT en visuels haute résolution.
        </p>
      </div>

      {error && (
        <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700 max-w-2xl w-full shadow-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p>{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      <div className="w-full max-w-5xl">
        {/* === IDLE: File upload with drag & drop === */}
        {appState === AppState.IDLE && (
          <>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`bg-white rounded-3xl shadow-xl p-10 text-center border-2 border-dashed transition-all ${
                isDragOver ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' : 'border-slate-200 hover:border-indigo-200'
              }`}
            >
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Upload className="w-10 h-10 text-indigo-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                {isDragOver ? 'Déposez votre fichier ici' : 'Importez votre fichier'}
              </h2>
              <p className="text-slate-500 mb-4 text-sm">Glissez-déposez un fichier ou cliquez pour sélectionner</p>
              <div className="flex justify-center gap-4 mb-8">
                <div className="flex flex-col items-center opacity-60">
                  <FileText className="w-6 h-6 mb-1 text-red-500" />
                  <span className="text-[10px] font-bold">PDF</span>
                </div>
                <div className="flex flex-col items-center opacity-60">
                  <FileCode className="w-6 h-6 mb-1 text-blue-500" />
                  <span className="text-[10px] font-bold">DOCX</span>
                </div>
                <div className="flex flex-col items-center opacity-60">
                  <FileText className="w-6 h-6 mb-1 text-slate-500" />
                  <span className="text-[10px] font-bold">TXT</span>
                </div>
              </div>

              <input type="file" accept=".pdf,.docx,.txt" ref={fileInputRef} onChange={handleFileUpload} className="hidden" />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center px-8 py-4 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg hover:bg-indigo-700 hover:shadow-indigo-500/30 transition-all transform hover:-translate-y-1"
              >
                <Upload className="w-5 h-5 mr-2" />
                Sélectionner un fichier
              </button>
            </div>

            {/* Restore batch backup banner — from localStorage */}
            {hasBackup && (
              <div className="mt-6 bg-blue-50 border border-blue-200 rounded-2xl p-5 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-blue-900">Batch sauvegardé détecté</h3>
                  <p className="text-sm text-blue-700 mt-1">Un batch différé a été sauvegardé avant la fermeture du serveur. Restaurez-le pour récupérer vos images.</p>
                </div>
                <div className="flex gap-3 ml-4">
                  <button
                    onClick={handleRestoreBatch}
                    disabled={isRestoring}
                    className="inline-flex items-center px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg disabled:opacity-50"
                  >
                    {isRestoring ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Restauration...</>
                    ) : (
                      <><Upload className="w-4 h-4 mr-2" /> Restaurer le batch</>
                    )}
                  </button>
                  <button
                    onClick={() => { clearBatchBackup(); setHasBackup(false); }}
                    className="inline-flex items-center px-4 py-2.5 bg-white text-slate-600 rounded-xl font-medium border border-slate-200 hover:bg-slate-50 transition-all"
                  >
                    Ignorer
                  </button>
                </div>
              </div>
            )}

            {/* Restore from file — always visible as fallback */}
            {!hasBackup && (
              <div className="mt-6 bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-slate-700 text-sm">Restaurer un batch depuis un fichier</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Si vous avez un fichier batch_backup.json d'une session précédente.</p>
                </div>
                <div>
                  <input
                    type="file"
                    ref={backupFileInputRef}
                    accept=".json"
                    onChange={handleRestoreFromFile}
                    className="hidden"
                  />
                  <button
                    onClick={() => backupFileInputRef.current?.click()}
                    disabled={isRestoring}
                    className="inline-flex items-center px-4 py-2 bg-white text-slate-700 rounded-lg font-medium text-sm border border-slate-300 hover:bg-slate-100 transition-all disabled:opacity-50"
                  >
                    <FileText className="w-4 h-4 mr-1.5" /> Charger un backup
                  </button>
                </div>
              </div>
            )}

            {/* Prompt Generator — create prompt files automatically */}
            <div className="mt-8">
              <PromptGenerator />
            </div>
          </>
        )}

        {/* === ANALYZING === */}
        {appState === AppState.ANALYZING && (
          <div className="bg-white rounded-3xl shadow-xl p-12 text-center flex flex-col items-center">
            <Loader2 className="w-16 h-16 text-indigo-600 animate-spin mb-6" />
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Analyse du fichier...</h2>
            <p className="text-slate-500">L'IA extrait et organise vos prompts.</p>
          </div>
        )}

        {/* === SELECTING: Configuration + section cards === */}
        {appState === AppState.SELECTING && (
          <div className="animate-fade-in">
            {/* Configuration Panel */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 mb-8 flex flex-col gap-8">
              {/* Model + Resolution Row */}
              <div className="flex flex-col md:flex-row items-start justify-between gap-6">
                <div className="flex flex-col w-full md:w-1/2">
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Modèle IA</span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setSelectedModel('gemini-3.1-flash-image-preview')}
                      className={`flex flex-col p-4 rounded-xl border-2 transition-all text-left ${
                        selectedModel === 'gemini-3.1-flash-image-preview' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <span className={`font-bold ${selectedModel === 'gemini-3.1-flash-image-preview' ? 'text-indigo-700' : 'text-slate-700'}`}>Nano Banana 2</span>
                      <span className="text-xs text-slate-500 mt-1">Rapide & Économique (Flash 3.1)</span>
                    </button>
                    <button
                      onClick={() => setSelectedModel('gemini-3-pro-image-preview')}
                      className={`flex flex-col p-4 rounded-xl border-2 transition-all text-left ${
                        selectedModel === 'gemini-3-pro-image-preview' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'
                      }`}
                    >
                      <span className={`font-bold ${selectedModel === 'gemini-3-pro-image-preview' ? 'text-indigo-700' : 'text-slate-700'}`}>Nano Banana Pro</span>
                      <span className="text-xs text-slate-500 mt-1">Haute Qualité (Pro 3)</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-col w-full md:w-auto">
                  <span className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Résolution</span>
                  <div className="flex flex-wrap gap-2">
                    {(['512px', '1K', '2K', '4K'] as ImageSize[]).map((res) => (
                      <button
                        key={res}
                        onClick={() => setSelectedResolution(res)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${
                          selectedResolution === res ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {res === '512px' && <Monitor className="w-4 h-4" />}
                        {res === '1K' && <Monitor className="w-4 h-4" />}
                        {res === '2K' && <Tv className="w-4 h-4" />}
                        {res === '4K' && <Zap className="w-4 h-4" />}
                        {res}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Generation Mode Selector */}
              <div>
                <span className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3 block">Mode de génération</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    onClick={() => setGenerationMode('realtime')}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                      generationMode === 'realtime' ? 'border-indigo-600 bg-indigo-50' : 'border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <Zap className={`w-5 h-5 mt-0.5 ${generationMode === 'realtime' ? 'text-indigo-600' : 'text-slate-400'}`} />
                    <div>
                      <span className={`font-bold block ${generationMode === 'realtime' ? 'text-indigo-700' : 'text-slate-700'}`}>Temps réel</span>
                      <span className="text-xs text-slate-500">Images générées une par une, résultat immédiat</span>
                      <span className="text-xs font-bold text-slate-400 block mt-1">{costInfo.perImage.toFixed(3)} $ / image</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setGenerationMode('batch')}
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                      generationMode === 'batch' ? 'border-emerald-600 bg-emerald-50' : 'border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    <Timer className={`w-5 h-5 mt-0.5 ${generationMode === 'batch' ? 'text-emerald-600' : 'text-slate-400'}`} />
                    <div>
                      <span className={`font-bold block ${generationMode === 'batch' ? 'text-emerald-700' : 'text-slate-700'}`}>
                        Batch différé
                        <span className="ml-2 text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">-50%</span>
                      </span>
                      <span className="text-xs text-slate-500">Envoyé à Google, résultat sous 24h max</span>
                      <span className="text-xs font-bold text-emerald-600 block mt-1">{costInfo.batchPerImage.toFixed(3)} $ / image</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* High Coherence Toggle — available for both realtime and batch */}
              <div>
                <button
                  onClick={() => setHighCoherence(!highCoherence)}
                  className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all text-left ${
                    highCoherence ? 'border-amber-500 bg-amber-50' : 'border-slate-100 hover:border-slate-200'
                  }`}
                >
                  <div className={`w-10 h-6 rounded-full relative transition-colors ${highCoherence ? 'bg-amber-500' : 'bg-slate-300'}`}>
                    <div className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all shadow ${highCoherence ? 'left-5' : 'left-1'}`} />
                  </div>
                  <div className="flex-1">
                    <span className={`font-bold block ${highCoherence ? 'text-amber-800' : 'text-slate-700'}`}>
                      Haute cohérence
                      {highCoherence && generationMode === 'realtime' && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">x2 appels API</span>}
                      {highCoherence && generationMode === 'batch' && <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">refs temps réel + batch -50%</span>}
                    </span>
                    <span className="text-xs text-slate-500">
                      {highCoherence
                        ? generationMode === 'batch'
                          ? 'Pré-génère les images de référence en temps réel, puis lance le batch des 3 vues avec chaque référence. Le batch bénéficie toujours du -50%.'
                          : 'Génère d\'abord une image de référence, puis les 3 vues à partir de cette référence. Réduit fortement les rejets.'
                        : 'Génération directe des 3 vues en un seul appel. Plus rapide mais plus de rejets possibles.'
                      }
                    </span>
                  </div>
                </button>
              </div>

              {/* Cost + Action Row */}
              <div className="pt-6 border-t border-slate-100 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 w-full md:w-auto">
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${generationMode === 'batch' ? 'bg-emerald-100' : 'bg-indigo-100'}`}>
                      <Zap className={`w-5 h-5 ${generationMode === 'batch' ? 'text-emerald-600' : 'text-indigo-600'}`} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estimation des coûts</p>
                      {generationMode === 'realtime' ? (
                        <p className="text-xl font-black text-slate-900">
                          {(highCoherence ? costInfo.total * 2 : costInfo.total).toFixed(3)} $
                          <span className="text-sm font-normal text-slate-500 ml-2">({(highCoherence ? costInfo.perImage * 2 : costInfo.perImage).toFixed(3)} $ / image{highCoherence ? ' HC' : ''})</span>
                        </p>
                      ) : (
                        <div>
                          <p className="text-xl font-black text-emerald-700">
                            {costInfo.batchTotal.toFixed(3)} $
                            <span className="text-sm font-normal text-emerald-500 ml-2">({costInfo.batchPerImage.toFixed(3)} $ / image)</span>
                          </p>
                          <p className="text-xs text-slate-400 line-through">{costInfo.total.toFixed(3)} $ en temps réel</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
                  {generationMode === 'batch' && (
                    <button
                      onClick={handleConnectDrive}
                      className={`inline-flex items-center px-4 py-3 rounded-xl font-bold transition-all justify-center ${
                        isDriveAuthenticated()
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-white text-slate-600 border-2 border-slate-200 hover:border-emerald-400'
                      }`}
                    >
                      <CloudUpload className="w-5 h-5 mr-2" />
                      {isDriveAuthenticated() ? 'Drive connecté' : 'Connecter Drive'}
                    </button>
                  )}
                  <button
                    onClick={generationMode === 'batch' ? startBatchGeneration : startGlobalGeneration}
                    className={`inline-flex items-center px-8 py-4 text-white rounded-xl font-bold shadow-lg hover:-translate-y-0.5 transition-all w-full md:w-auto justify-center ${
                      generationMode === 'batch'
                        ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:shadow-emerald-500/40'
                        : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:shadow-indigo-500/40'
                    }`}
                  >
                    {generationMode === 'batch' ? <Clock className="w-5 h-5 mr-2" /> : <Layers className="w-5 h-5 mr-2" />}
                    {generationMode === 'batch' ? 'Lancer le batch différé' : 'Lancer la génération complète'}
                  </button>
                </div>
              </div>
            </div>

            {/* Section cards */}
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
              <div className="text-left">
                <h2 className="text-2xl font-bold text-slate-900">Sections Détectées ({groups.length})</h2>
                <p className="text-sm text-slate-500">{totalPrompts} prompts au total</p>
                <button onClick={() => setAppState(AppState.IDLE)} className="text-sm text-slate-500 hover:text-indigo-600 underline">Importer un autre fichier</button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {groups.map((group) => (
                <button
                  key={group.id}
                  onClick={() => startSingleGeneration(group)}
                  className="group bg-white rounded-2xl p-6 shadow-sm hover:shadow-xl border border-slate-200 hover:border-indigo-500 transition-all text-left flex flex-col h-full relative overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-4">
                    <span className="bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide group-hover:bg-indigo-100 group-hover:text-indigo-700 transition-colors">Section {group.id}</span>
                    <ImageIcon className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2 group-hover:text-indigo-700 transition-colors line-clamp-2">{group.name}</h3>
                  <p className="text-slate-500 text-sm mb-4 flex-grow">{group.items.length} prompts détectés</p>
                  <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                      Est. {calculateCost(group.items.length).total.toFixed(3)} $
                    </div>
                    <div className="flex items-center text-indigo-600 font-medium opacity-60 group-hover:opacity-100 transition-opacity">
                      Générer <PlayCircle className="w-4 h-4 ml-2" />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* === GENERATING (realtime) === */}
        {(appState === AppState.GENERATING || appState === AppState.GENERATING_ALL) && progress && (
          <div className="bg-white rounded-3xl shadow-xl p-12 text-center max-w-2xl mx-auto">
            <div className="mb-8">
              <div className="relative w-full h-6 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                <div className="absolute top-0 left-0 h-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all duration-500 ease-out" style={{ width: `${(progress.current / progress.total) * 100}%` }}></div>
              </div>
              <div className="flex justify-between mt-3 text-sm text-slate-500 font-medium">
                <span>{progress.groupName || 'Progression'}</span>
                <span>{progress.current} / {progress.total} images</span>
              </div>
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {appState === AppState.GENERATING_ALL ? "Génération Globale" : "Génération du Groupe"}
            </h2>
            <p className="text-indigo-600 font-medium animate-pulse text-lg mb-8">{progress.status}</p>

            <button
              onClick={stopGeneration}
              disabled={isStopping}
              className={`inline-flex items-center px-6 py-3 rounded-xl font-bold transition-all ${
                isStopping ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-red-50 text-red-600 hover:bg-red-100 border border-red-100'
              }`}
            >
              {isStopping ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Arrêt en cours...</>
              ) : (
                <><AlertCircle className="w-4 h-4 mr-2" /> Arrêter la génération</>
              )}
            </button>
            <p className="text-xs text-slate-400 mt-4 italic">Les images déjà générées seront conservées.</p>
          </div>
        )}

        {/* === BATCH SUBMITTED / MONITORING === */}
        {(appState === AppState.BATCH_SUBMITTED || appState === AppState.BATCH_MONITORING) && (
          <div className="bg-white rounded-3xl shadow-xl p-12 text-center max-w-2xl mx-auto">
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
              {appState === AppState.BATCH_SUBMITTED ? (
                <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
              ) : (
                <Clock className="w-10 h-10 text-emerald-600 animate-pulse" />
              )}
            </div>

            <h2 className="text-2xl font-bold text-slate-900 mb-2">
              {appState === AppState.BATCH_SUBMITTED ? 'Soumission du batch...' : 'Batch en cours de traitement'}
            </h2>

            {activeBatchJob && (
              <div className="mt-4 bg-slate-50 rounded-xl p-4 text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">ID du job</span>
                  <span className="font-mono text-xs text-slate-600">{activeBatchJob.name.split('/').pop()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Images à générer</span>
                  <span className="font-bold">{activeBatchJob.totalRequests}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Modèle</span>
                  <span>{selectedModel === 'gemini-3.1-flash-image-preview' ? 'Nano Banana 2' : 'Nano Banana Pro'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Résolution</span>
                  <span>{selectedResolution}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Coût estimé</span>
                  <span className="font-bold text-emerald-600">{costInfo.batchTotal.toFixed(3)} $ (batch -50%)</span>
                </div>
              </div>
            )}

            {batchProgress && (
              <div className="mt-6">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                    batchProgress.state === 'JOB_STATE_RUNNING' ? 'bg-blue-100 text-blue-700' :
                    batchProgress.state === 'JOB_STATE_SUCCEEDED' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {batchProgress.state === 'JOB_STATE_RUNNING' ? 'En cours' :
                     batchProgress.state === 'JOB_STATE_PENDING' ? 'En attente' :
                     batchProgress.state === 'JOB_STATE_SUCCEEDED' ? 'Terminé' : batchProgress.state}
                  </span>
                </div>
                {batchProgress.completed > 0 && (
                  <p className="text-sm text-slate-500">
                    {batchProgress.completed} terminées
                    {batchProgress.failed > 0 && <span className="text-red-500 ml-2">({batchProgress.failed} échouées)</span>}
                  </p>
                )}
              </div>
            )}

            <p className="text-sm text-slate-400 mt-6">
              Le traitement peut prendre de quelques minutes à 24 heures. Vous pouvez sauvegarder le batch avant de fermer, puis le restaurer au redémarrage.
            </p>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleBackupBatch}
                className="inline-flex items-center px-6 py-3 bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-100 rounded-xl font-bold transition-all"
              >
                <Download className="w-4 h-4 mr-2" />
                {hasBackup ? 'Batch sauvegardé ✓' : 'Sauvegarder le batch'}
              </button>
              <button
                onClick={handleCancelBatch}
                className="inline-flex items-center px-6 py-3 bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 rounded-xl font-bold transition-all"
              >
                <AlertCircle className="w-4 h-4 mr-2" />
                Annuler le batch
              </button>
            </div>
          </div>
        )}

        {/* === FINISHED (single group) === */}
        {appState === AppState.FINISHED && selectedGroup && (
          <div className="animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
              <div>
                <button onClick={resetSelection} className="text-slate-500 hover:text-indigo-600 flex items-center text-sm font-medium mb-2 transition-colors">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Retour
                </button>
                <h2 className="text-3xl font-bold text-slate-900">{selectedGroup.name}</h2>
              </div>
              <div className="flex gap-3">
                <button onClick={handleDownloadZip} className="inline-flex items-center px-4 py-2 bg-white border border-slate-300 rounded-lg font-medium text-slate-700 shadow-sm hover:bg-slate-50 hover:text-indigo-600 transition-colors">
                  <Download className="w-4 h-4 mr-2" /> .ZIP
                </button>
                <button onClick={handleDownloadPdf} className="inline-flex items-center px-4 py-2 bg-indigo-600 border border-transparent rounded-lg font-medium text-white shadow-sm hover:bg-indigo-700 transition-colors">
                  <FileText className="w-4 h-4 mr-2" /> .PDF
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {generatedImages.map((img, idx) => (
                <div key={idx} className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-100 group">
                  <div className="aspect-video bg-slate-100 relative overflow-hidden">
                    <img src={img.base64} alt={selectedGroup.items[img.itemId].name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-md text-white text-xs font-bold px-2 py-1 rounded flex items-center gap-1">
                      <Zap className="w-3 h-3 text-yellow-400" /> {img.resolution}
                    </div>
                  </div>
                  <div className="flex justify-between px-5 py-2 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500">
                    <span>FACE (0°)</span>
                    <span>PROFIL (90°)</span>
                    <span>ARRIÈRE (180°)</span>
                  </div>
                  <div className="p-5">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-bold text-slate-900">{selectedGroup.items[img.itemId].name}</h3>
                      <CheckCircle2 className="w-5 h-5 text-green-500" />
                    </div>
                    <p className="text-sm text-slate-500 line-clamp-2" title={img.prompt}>{img.prompt}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* === FINISHED ALL === */}
        {appState === AppState.FINISHED_ALL && (
          <div className="animate-fade-in">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-10 gap-6 bg-white p-6 rounded-2xl shadow-sm border border-indigo-100">
              <div>
                <button onClick={resetSelection} className="text-slate-500 hover:text-indigo-600 flex items-center text-sm font-medium mb-2 transition-colors">
                  <ArrowLeft className="w-4 h-4 mr-1" /> Retour
                </button>
                <h2 className="text-3xl font-bold text-slate-900 bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-purple-600">
                  Génération Terminée !
                </h2>
                <p className="text-slate-500 mt-1">
                  {allGeneratedImages.length} images générées en {selectedResolution}
                  {rejectedImages.length > 0 && (
                    <span className="text-amber-600"> — {allGeneratedImages.length - rejectedImages.length} validées, {rejectedImages.length} rejetée(s)</span>
                  )}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                <button onClick={handleDownloadGlobalZip} className="flex-1 lg:flex-none inline-flex items-center justify-center px-6 py-3 bg-white border-2 border-slate-200 rounded-xl font-bold text-slate-700 hover:border-indigo-500 hover:text-indigo-600 shadow-sm transition-all">
                  <Download className="w-5 h-5 mr-2" /> ZIP Complet
                </button>
                <button onClick={() => {
                  const { consistent } = filterConsistentImages(allGeneratedImages, verificationResults);
                  downloadMergedPdf(groups, consistent.length > 0 ? consistent : allGeneratedImages);
                }} className="flex-1 lg:flex-none inline-flex items-center justify-center px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 shadow-indigo-500/30 transition-all">
                  <FileText className="w-5 h-5 mr-2" /> PDF Catalogue
                </button>
                {/* Drive status indicator (replaces Upload button) */}
                {driveAutoStatus === 'done' && driveLink ? (
                  <a href={driveLink} target="_blank" rel="noreferrer" className="flex-1 lg:flex-none inline-flex items-center justify-center px-6 py-3 bg-emerald-100 text-emerald-700 rounded-xl font-bold border-2 border-emerald-300 transition-all">
                    <CheckCircle2 className="w-5 h-5 mr-2" /> Drive OK
                  </a>
                ) : driveAutoStatus === 'uploading' ? (
                  <div className="flex-1 lg:flex-none inline-flex items-center justify-center px-6 py-3 bg-emerald-50 text-emerald-600 rounded-xl font-bold border-2 border-emerald-200">
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" /> Upload...
                  </div>
                ) : driveAutoStatus === 'error' ? (
                  <button onClick={() => {
                    const { consistent } = filterConsistentImages(allGeneratedImages, verificationResults);
                    autoUploadToDrive(allGeneratedImages, consistent);
                  }} className="flex-1 lg:flex-none inline-flex items-center justify-center px-6 py-3 bg-red-50 text-red-600 rounded-xl font-bold border-2 border-red-200 hover:bg-red-100 transition-all">
                    <AlertCircle className="w-5 h-5 mr-2" /> Réessayer Drive
                  </button>
                ) : !isDriveAuthenticated() ? (
                  <button onClick={handleConnectDrive} className="flex-1 lg:flex-none inline-flex items-center justify-center px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg hover:bg-emerald-700 shadow-emerald-500/30 transition-all">
                    <CloudUpload className="w-5 h-5 mr-2" /> Connecter Drive
                  </button>
                ) : null}
              </div>
            </div>

            {/* Drive upload progress */}
            {driveUploadProgress && (
              <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-emerald-600 animate-spin" />
                <span className="text-emerald-700 font-medium">Upload Drive: {driveUploadProgress.current}/{driveUploadProgress.total} fichiers...</span>
              </div>
            )}
            {driveLink && !driveUploadProgress && (
              <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <span className="text-emerald-700 font-medium">Images + PDF catalogue uploadés sur Drive !</span>
                <a href={driveLink} target="_blank" rel="noreferrer" className="ml-auto text-emerald-600 hover:text-emerald-800 underline font-bold text-sm">
                  Ouvrir le dossier
                </a>
              </div>
            )}

            {/* Verification summary */}
            {rejectedImages.length > 0 && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-5 h-5 text-amber-600" />
                  <span className="text-amber-800 font-bold">{rejectedImages.length} objet(s) rejeté(s) — vues incohérentes</span>
                </div>
                <p className="text-amber-700 text-sm mb-3">Ces images ont été exclues du PDF catalogue car les 3 vues ne montrent pas exactement le même objet.</p>
                <div className="space-y-2">
                  {verificationResults.filter(r => !r.isConsistent).map((r, idx) => (
                    <div key={idx} className="bg-white rounded-lg p-3 border border-amber-100">
                      <span className="font-bold text-slate-800">{r.itemName}</span>
                      <ul className="mt-1 text-sm text-amber-700">
                        {r.issues.map((issue, i) => (
                          <li key={i}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-12">
              {groups.map(group => {
                const pImgs = allGeneratedImages.filter(img => img.groupId === group.id);
                if (pImgs.length === 0) return null;
                return (
                  <div key={group.id} className="border-b border-slate-200 pb-12 last:border-0">
                    <div className="flex items-center mb-6">
                      <span className="bg-indigo-100 text-indigo-800 text-sm font-bold px-3 py-1 rounded-full uppercase mr-3">Section {group.id}</span>
                      <h3 className="text-2xl font-bold text-slate-800">{group.name}</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {pImgs.map((img, idx) => {
                        const verResult = verificationResults.find(r => r.groupId === img.groupId && r.itemId === img.itemId);
                        const isRejected = verResult && !verResult.isConsistent;
                        return (
                          <div key={idx} className={`group relative rounded-xl overflow-hidden shadow-md ${isRejected ? 'ring-2 ring-red-400 opacity-70' : ''}`}>
                            <img src={img.base64} alt="preview" className="w-full aspect-video object-cover" />
                            <div className="absolute top-2 right-2 bg-black/40 text-white text-[10px] px-1.5 py-0.5 rounded backdrop-blur-sm">{img.resolution}</div>
                            {/* Verification badge */}
                            <div className="absolute top-2 left-2">
                              {isRejected ? (
                                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">REJETÉ</span>
                              ) : verResult?.isConsistent ? (
                                <span className="bg-green-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">VALIDÉ</span>
                              ) : null}
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-black/40 backdrop-blur-sm flex justify-between px-2 py-1 text-[8px] font-bold text-white/80">
                              <span>FACE</span>
                              <span>PROFIL</span>
                              <span>ARRIÈRE</span>
                            </div>
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center">
                              <div>
                                <span className="text-white text-xs font-medium block">{group.items[img.itemId].name}</span>
                                {isRejected && verResult?.issues && (
                                  <span className="text-red-300 text-[10px] block mt-1">{verResult.issues.join(', ')}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
