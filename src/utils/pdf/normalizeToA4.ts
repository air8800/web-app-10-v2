import { PDFDocument, PageSizes } from 'pdf-lib';

export interface NormalizeOptions {
  onProgress?: (progress: number, message: string) => void;
  skipIfA4?: boolean;
  tolerance?: number;
}

export interface NormalizeResult {
  normalizedFile: File;
  wasNormalized: boolean;
  pageCount: number;
  orientations: ('portrait' | 'landscape')[];
}

const A4_PORTRAIT = PageSizes.A4;
const A4_LANDSCAPE = [PageSizes.A4[1], PageSizes.A4[0]] as [number, number];

const A4_TOLERANCE = 5;

function isA4Size(width: number, height: number, tolerance: number = A4_TOLERANCE): boolean {
  const isPortrait =
    Math.abs(width - A4_PORTRAIT[0]) <= tolerance &&
    Math.abs(height - A4_PORTRAIT[1]) <= tolerance;

  const isLandscape =
    Math.abs(width - A4_LANDSCAPE[0]) <= tolerance &&
    Math.abs(height - A4_LANDSCAPE[1]) <= tolerance;

  return isPortrait || isLandscape;
}

function detectOptimalOrientation(
  pageWidth: number,
  pageHeight: number
): 'portrait' | 'landscape' {
  if (pageWidth > pageHeight) {
    return 'landscape';
  }
  return 'portrait';
}

function getA4Dimensions(orientation: 'portrait' | 'landscape'): [number, number] {
  return orientation === 'portrait' ? A4_PORTRAIT : A4_LANDSCAPE;
}

export async function normalizePdfToA4(
  file: File,
  options: NormalizeOptions = {}
): Promise<NormalizeResult> {
  const { onProgress, skipIfA4 = true, tolerance = A4_TOLERANCE } = options;

  try {
    onProgress?.(0, 'Loading PDF...');

    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);

    const pageCount = pdfDoc.getPageCount();
    const orientations: ('portrait' | 'landscape')[] = [];

    if (skipIfA4) {
      let allPagesA4 = true;
      for (let i = 0; i < pageCount; i++) {
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();
        if (!isA4Size(width, height, tolerance)) {
          allPagesA4 = false;
          break;
        }
      }

      if (allPagesA4) {
        console.log('ℹ️ PDF already A4-sized, skipping normalization');
        onProgress?.(100, 'PDF already A4-sized');
        return {
          normalizedFile: file,
          wasNormalized: false,
          pageCount,
          orientations: Array(pageCount).fill('portrait'),
        };
      }
    }

    onProgress?.(10, `Normalizing ${pageCount} pages to A4...`);

    console.log(`🔄 Starting normalization of ${pageCount} pages...`);

    for (let i = 0; i < pageCount; i++) {
      const page = pdfDoc.getPage(i);

      const rotation = page.getRotation().angle;
      const isRotated90or270 = rotation === 90 || rotation === 270;
      
      const cropBox = page.getCropBox();
      const mediaBox = page.getMediaBox();
      
      const box = cropBox || mediaBox;
      const boxX = box.x;
      const boxY = box.y;
      const boxWidth = box.width;
      const boxHeight = box.height;

      const unrotatedWidth = isRotated90or270 ? boxHeight : boxWidth;
      const unrotatedHeight = isRotated90or270 ? boxWidth : boxHeight;

      const visualWidth = isRotated90or270 ? boxHeight : boxWidth;
      const visualHeight = isRotated90or270 ? boxWidth : boxHeight;

      const orientation = detectOptimalOrientation(visualWidth, visualHeight);
      orientations.push(orientation);

      console.log(`📄 Page ${i + 1}: Original size ${boxWidth.toFixed(1)} x ${boxHeight.toFixed(1)} (visual: ${visualWidth.toFixed(1)} x ${visualHeight.toFixed(1)}) → ${orientation}`);

      const [a4VisualWidth, a4VisualHeight] = getA4Dimensions(orientation);

      const a4UnrotatedWidth = isRotated90or270 ? a4VisualHeight : a4VisualWidth;
      const a4UnrotatedHeight = isRotated90or270 ? a4VisualWidth : a4VisualHeight;

      const scaleX = a4UnrotatedWidth / unrotatedWidth;
      const scaleY = a4UnrotatedHeight / unrotatedHeight;
      const baseScale = Math.min(scaleX, scaleY);
      
      const scale = baseScale * 0.95;

      const scaledUnrotatedWidth = unrotatedWidth * scale;
      const scaledUnrotatedHeight = unrotatedHeight * scale;

      const centeringOffsetX = (a4UnrotatedWidth - scaledUnrotatedWidth) / 2;
      const centeringOffsetY = (a4UnrotatedHeight - scaledUnrotatedHeight) / 2;

      console.log(`  📐 Scale: ${scale.toFixed(3)} (base: ${baseScale.toFixed(3)} × 0.95 = 5% margin), Target: ${a4UnrotatedWidth.toFixed(1)} x ${a4UnrotatedHeight.toFixed(1)}`);
      console.log(`  📦 Content size after scale: ${scaledUnrotatedWidth.toFixed(1)} x ${scaledUnrotatedHeight.toFixed(1)}, Margins: ${centeringOffsetX.toFixed(1)}, ${centeringOffsetY.toFixed(1)}`);

      page.translateContent(-boxX, -boxY);

      page.scaleContent(scale, scale);

      page.translateContent(centeringOffsetX, centeringOffsetY);

      page.setMediaBox(0, 0, a4UnrotatedWidth, a4UnrotatedHeight);
      page.setCropBox(0, 0, a4UnrotatedWidth, a4UnrotatedHeight);
      
      console.log(`  ✅ Page ${i + 1} normalized to A4 ${orientation} (${a4UnrotatedWidth.toFixed(1)} x ${a4UnrotatedHeight.toFixed(1)})`);

      
      try {
        page.setTrimBox(0, 0, a4UnrotatedWidth, a4UnrotatedHeight);
        page.setBleedBox(0, 0, a4UnrotatedWidth, a4UnrotatedHeight);
      } catch {
        // TrimBox/BleedBox not present or not settable
      }

      const progress = 10 + ((i + 1) / pageCount) * 80;
      onProgress?.(
        progress,
        `Normalizing page ${i + 1}/${pageCount} (${orientation})...`
      );

      if (i % 10 === 0 && i > 0) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    onProgress?.(90, 'Finalizing PDF...');

    const normalizedBytes = await pdfDoc.save({
      useObjectStreams: true,
    });

    const normalizedBlob = new Blob([new Uint8Array(normalizedBytes)], { type: 'application/pdf' });
    const timestamp = Date.now();
    const originalName = file.name.replace(/\.pdf$/i, '');
    const normalizedFileName = `${originalName}_normalized_${timestamp}.pdf`;
    const normalizedFile = new File([normalizedBlob], normalizedFileName, {
      type: 'application/pdf',
      lastModified: timestamp,
    });

    const originalSize = (file.size / 1024 / 1024).toFixed(2);
    const newSize = (normalizedFile.size / 1024 / 1024).toFixed(2);
    console.log(`✅ Normalization complete: ${pageCount} pages`);
    console.log(`📐 Orientations: ${orientations.join(', ')}`);
    console.log(`📦 File size: ${originalSize} MB → ${newSize} MB`);

    onProgress?.(100, 'Normalization complete!');

    return {
      normalizedFile,
      wasNormalized: true,
      pageCount,
      orientations,
    };
  } catch (error) {
    console.error('Error normalizing PDF to A4:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to normalize PDF: ${errorMessage}`);
  }
}
