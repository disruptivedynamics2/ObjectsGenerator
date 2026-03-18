/**
 * Google Drive integration service.
 * Uses OAuth2 to upload batch results directly to a user's Drive folder.
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_FILES_URL = 'https://www.googleapis.com/drive/v3/files';

let accessToken: string | null = null;
let tokenExpiresAt: number = 0;

/**
 * Initiates OAuth2 flow via popup to get Google Drive access.
 * Uses the implicit grant flow suitable for client-side apps.
 */
export const authenticateGoogleDrive = (): Promise<string> => {
  return new Promise((resolve, reject) => {
    if (accessToken && Date.now() < tokenExpiresAt) {
      resolve(accessToken);
      return;
    }

    if (!GOOGLE_CLIENT_ID) {
      reject(new Error('GOOGLE_CLIENT_ID non configuré. Ajoutez-le dans votre fichier .env.local'));
      return;
    }

    const redirectUri = window.location.origin;
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=token` +
      `&scope=${encodeURIComponent(GOOGLE_DRIVE_SCOPE)}` +
      `&prompt=consent`;

    const popup = window.open(authUrl, 'google-auth', 'width=500,height=600');
    if (!popup) {
      reject(new Error('Impossible d\'ouvrir la fenêtre d\'authentification. Vérifiez les bloqueurs de popups.'));
      return;
    }

    const interval = setInterval(() => {
      try {
        if (popup.closed) {
          clearInterval(interval);
          reject(new Error('Authentification annulée par l\'utilisateur.'));
          return;
        }

        const popupUrl = popup.location.href;
        if (popupUrl.startsWith(redirectUri)) {
          const hash = popup.location.hash.substring(1);
          const params = new URLSearchParams(hash);
          const token = params.get('access_token');
          const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

          popup.close();
          clearInterval(interval);

          if (token) {
            accessToken = token;
            tokenExpiresAt = Date.now() + (expiresIn * 1000) - 60000; // 1 min safety margin
            resolve(token);
          } else {
            reject(new Error('Token non reçu lors de l\'authentification.'));
          }
        }
      } catch {
        // Cross-origin errors are expected while the popup is on Google's domain
      }
    }, 500);
  });
};

/**
 * Check if we have a valid Drive token.
 */
export const isDriveAuthenticated = (): boolean => {
  return !!accessToken && Date.now() < tokenExpiresAt;
};

/**
 * Logout from Google Drive.
 */
export const logoutGoogleDrive = (): void => {
  accessToken = null;
  tokenExpiresAt = 0;
};

/**
 * Creates a folder in Google Drive. Returns the folder ID.
 */
export const createDriveFolder = async (folderName: string, parentFolderId?: string): Promise<string> => {
  const token = await authenticateGoogleDrive();

  const metadata: any = {
    name: folderName,
    mimeType: 'application/vnd.google-apps.folder',
  };

  if (parentFolderId) {
    metadata.parents = [parentFolderId];
  }

  const response = await fetch(DRIVE_FILES_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(metadata),
  });

  if (!response.ok) {
    throw new Error(`Erreur création dossier Drive: ${response.statusText}`);
  }

  const data = await response.json();
  return data.id;
};

/**
 * Uploads a base64 image to Google Drive.
 */
export const uploadImageToDrive = async (
  base64Data: string,
  fileName: string,
  folderId: string
): Promise<{ id: string; webViewLink: string }> => {
  const token = await authenticateGoogleDrive();

  // Convert base64 to blob
  const base64Content = base64Data.split(',')[1];
  const mimeType = base64Data.split(';')[0].split(':')[1] || 'image/png';
  const byteCharacters = atob(base64Content);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }
  const blob = new Blob([byteArray], { type: mimeType });

  // Multipart upload
  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: mimeType,
  };

  const formData = new FormData();
  formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  formData.append('file', blob);

  const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,webViewLink`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Erreur upload Drive: ${response.statusText}`);
  }

  return await response.json();
};

/**
 * Uploads all batch results to Google Drive organized in folders by group.
 */
export const uploadBatchResultsToDrive = async (
  images: { groupName: string; itemName: string; base64: string }[],
  rootFolderName: string,
  onProgress?: (current: number, total: number) => void
): Promise<string> => {
  // Create root folder
  const rootFolderId = await createDriveFolder(rootFolderName);

  // Group images by group name
  const groupedImages = new Map<string, typeof images>();
  for (const img of images) {
    const existing = groupedImages.get(img.groupName) || [];
    existing.push(img);
    groupedImages.set(img.groupName, existing);
  }

  // Create subfolders and upload images
  let processed = 0;
  const total = images.length;

  for (const [groupName, groupImages] of groupedImages) {
    const safeName = groupName.replace(/[^a-z0-9àâäéèêëïîôùûüÿçœæ\s-]/gi, '_').substring(0, 50);
    const groupFolderId = await createDriveFolder(safeName, rootFolderId);

    for (const img of groupImages) {
      const safeItemName = img.itemName.replace(/[^a-z0-9àâäéèêëïîôùûüÿçœæ\s-]/gi, '_').substring(0, 50);
      await uploadImageToDrive(img.base64, `${safeItemName}.png`, groupFolderId);
      processed++;
      onProgress?.(processed, total);
    }
  }

  return `https://drive.google.com/drive/folders/${rootFolderId}`;
};
