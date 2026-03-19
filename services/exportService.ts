import { GeneratedImage, PromptGroup } from '../types';

// Single Group Exports
export const downloadZip = async (group: PromptGroup, images: GeneratedImage[]) => {
  if (!window.JSZip) throw new Error("JSZip not loaded");

  const zip = new window.JSZip();
  // Safe filename from group name
  const safeName = group.name.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
  const folder = zip.folder(`Groupe_${group.id}_${safeName}`);

  images.forEach((img, index) => {
    if (img.groupId !== group.id) return;
    // Safe item name
    const itemName = group.items[img.itemId].name.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
    const filename = `${index + 1}_${itemName}.png`;
    const data = img.base64.split(',')[1];
    folder.file(filename, data, { base64: true });
  });

  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(content, `Images_${safeName}.zip`);
};

export const downloadPdf = (group: PromptGroup, images: GeneratedImage[]) => {
  if (!window.jspdf) throw new Error("jsPDF not loaded");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  const groupImages = images.filter(img => img.groupId === group.id);

  addGroupToPdf(doc, group, groupImages, false);
  doc.save(`Catalogue_${group.name.replace(/[^a-z0-9]/gi, '_')}.pdf`);
};

// Global Exports
export const downloadGlobalZip = async (groups: PromptGroup[], allImages: GeneratedImage[]) => {
  if (!window.JSZip) throw new Error("JSZip not loaded");

  const zip = new window.JSZip();
  const rootFolder = zip.folder("Toutes_Les_Images");

  groups.forEach(group => {
    const safeGroupName = group.name.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
    const groupFolder = rootFolder.folder(`${group.id}_${safeGroupName}`);
    const groupImages = allImages.filter(img => img.groupId === group.id);

    groupImages.forEach((img) => {
      const itemName = group.items[img.itemId].name.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
      const filename = `${itemName}.png`;
      const data = img.base64.split(',')[1];
      groupFolder.file(filename, data, { base64: true });
    });
  });

  const content = await zip.generateAsync({ type: "blob" });
  downloadBlob(content, `Complet_Images.zip`);
};

export const downloadMergedPdf = (groups: PromptGroup[], allImages: GeneratedImage[]) => {
  if (!window.jspdf) throw new Error("jsPDF not loaded");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  groups.forEach((group, index) => {
    const groupImages = allImages.filter(img => img.groupId === group.id);
    if (groupImages.length > 0) {
      addGroupToPdf(doc, group, groupImages, index > 0);
    }
  });

  const dateStr = new Date().toISOString().split('T')[0];
  doc.save(`Catalogue_Complet_${dateStr}.pdf`);
};

/**
 * Generates a merged PDF as a Blob (for Drive upload) without triggering a download.
 */
export const generateMergedPdfBlob = (groups: PromptGroup[], allImages: GeneratedImage[]): Blob => {
  if (!window.jspdf) throw new Error("jsPDF not loaded");
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  groups.forEach((group, index) => {
    const groupImages = allImages.filter(img => img.groupId === group.id);
    if (groupImages.length > 0) {
      addGroupToPdf(doc, group, groupImages, index > 0);
    }
  });

  return doc.output('blob');
};

// Helpers
const downloadBlob = (blob: Blob, filename: string) => {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Adds a single slide (page) to the PDF with a 3-view image, labels, dimensions, and prompt.
 */
const addSlideToDoc = (
  doc: any,
  img: GeneratedImage,
  imageBase64: string,
  viewLabels: string[],
  group: PromptGroup,
  slideSubtitle?: string
) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const availableWidth = pageWidth - (margin * 2);
  const item = group.items[img.itemId];

  // Header
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  const title = slideSubtitle
    ? `${item.name} — ${slideSubtitle}`
    : item.name;
  doc.text(title, 10, 12);

  // Image
  const imgWidth = availableWidth;
  const imgHeight = 120;
  try {
    doc.addImage(imageBase64, 'PNG', margin, 18, imgWidth, imgHeight, undefined, 'FAST');
  } catch (e) {
    console.error("Error adding image to PDF", e);
  }

  // View labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(50);
  const labelY = 18 + imgHeight + 8;
  if (viewLabels.length >= 3) {
    doc.text(viewLabels[0], margin + (imgWidth / 6), labelY, { align: 'center' });
    doc.text(viewLabels[1], margin + (imgWidth / 2), labelY, { align: 'center' });
    doc.text(viewLabels[2], margin + (5 * imgWidth / 6), labelY, { align: 'center' });
  }

  // Dimensions
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(0);
  const dimensionsY = labelY + 10;
  const dims = item.dimensions || "--- x --- x ---";
  doc.text(`Longueur (cm) × Largeur (cm) × hauteur (cm) : ${dims}`, pageWidth / 2, dimensionsY, { align: 'center' });

  // Prompt
  doc.setFontSize(9);
  doc.setTextColor(80);
  const pageHeight = doc.internal.pageSize.getHeight();
  const splitPrompt = doc.splitTextToSize(`Prompt: ${img.prompt}`, availableWidth);
  const lineHeight = 4;
  const totalPromptHeight = splitPrompt.length * lineHeight;
  const promptY = pageHeight - margin - totalPromptHeight + lineHeight;
  doc.text(splitPrompt, margin, promptY);
};

const addGroupToPdf = (doc: any, group: PromptGroup, images: GeneratedImage[], forceNewPage: boolean) => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const availableWidth = pageWidth - (margin * 2);

  // Section Title Page
  if (forceNewPage) doc.addPage();

  doc.setFillColor(240, 240, 250);
  doc.rect(0, 0, pageWidth, doc.internal.pageSize.getHeight(), 'F');

  doc.setFontSize(24);
  doc.setTextColor(50, 50, 80);
  doc.text(`Section ${group.id}`, pageWidth / 2, doc.internal.pageSize.getHeight() / 2 - 10, { align: 'center' });
  doc.setFontSize(32);
  doc.setTextColor(30, 30, 100);
  const splitTitle = doc.splitTextToSize(group.name, availableWidth);
  doc.text(splitTitle, pageWidth / 2, doc.internal.pageSize.getHeight() / 2 + 5, { align: 'center' });

  doc.addPage();

  // Images
  images.forEach((img, index) => {
    if (index > 0) doc.addPage();

    // Slide 1 — always present (views 1-3 or the standard 3-view)
    const slide1Labels = img.base64Slide2
      ? ['3/4 AVANT HAUT', '3/4 AVANT BAS', '3/4 ARRIÈRE HAUT']
      : ['VUE DE FACE (0°)', 'VUE DE PROFIL DROIT (90°)', 'VUE ARRIÈRE (180°)'];

    addSlideToDoc(doc, img, img.base64, slide1Labels, group, img.base64Slide2 ? 'Vues 1-3' : undefined);

    // Slide 2 — only for 6-view ComfyUI results
    if (img.base64Slide2) {
      doc.addPage();
      addSlideToDoc(
        doc, img, img.base64Slide2,
        ['3/4 ARRIÈRE BAS', 'PROFIL', 'DESSUS'],
        group,
        'Vues 4-6'
      );
    }
  });
};