export type PageOrientation = 'portrait' | 'landscape' | 'square';

export interface PageDimensions {
  width: number;
  height: number;
  orientation: PageOrientation;
}

export function detectPageOrientation(width: number, height: number): PageOrientation {
  const aspectRatio = width / height;
  
  if (Math.abs(aspectRatio - 1) < 0.05) {
    return 'square';
  }
  
  return width > height ? 'landscape' : 'portrait';
}

export function getPageDimensions(width: number, height: number): PageDimensions {
  return {
    width,
    height,
    orientation: detectPageOrientation(width, height)
  };
}
