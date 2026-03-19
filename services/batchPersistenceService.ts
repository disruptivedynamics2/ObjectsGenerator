import { BatchJob } from '../types';

const STORAGE_KEY = 'objectgen_batch_backup';
const LOCAL_FILE_PATH = '/batch_backup.json';

export interface BatchBackup {
  job: BatchJob;
  savedAt: string;
}

/**
 * Saves the active batch job to BOTH localStorage and a local JSON file.
 * The local file acts as fallback if browser cache is cleared.
 */
export const backupBatchJob = (job: BatchJob): void => {
  const backup: BatchBackup = {
    job,
    savedAt: new Date().toISOString(),
  };
  const json = JSON.stringify(backup, null, 2);

  // 1. Save to localStorage (primary)
  try {
    localStorage.setItem(STORAGE_KEY, json);
  } catch (e) {
    console.warn('Failed to save batch backup to localStorage:', e);
  }

  // 2. Save to local file via download (fallback)
  try {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'batch_backup.json';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e) {
    console.warn('Failed to download batch backup file:', e);
  }
};

/**
 * Restores a previously saved batch job.
 * Tries localStorage first, then falls back to a provided file.
 */
export const restoreBatchJob = (): BatchBackup | null => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) return JSON.parse(data) as BatchBackup;
  } catch {
    // localStorage failed, will try file restore
  }
  return null;
};

/**
 * Restores a batch backup from a JSON file (fallback when localStorage is empty).
 */
export const restoreBatchFromFile = (fileContent: string): BatchBackup | null => {
  try {
    const backup = JSON.parse(fileContent) as BatchBackup;
    if (backup?.job?.name && backup?.job?.groups) {
      // Also re-save to localStorage for convenience
      localStorage.setItem(STORAGE_KEY, fileContent);
      return backup;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Checks if a batch backup exists in localStorage.
 */
export const hasBatchBackup = (): boolean => {
  return localStorage.getItem(STORAGE_KEY) !== null;
};

/**
 * Clears the batch backup from localStorage.
 */
export const clearBatchBackup = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};
