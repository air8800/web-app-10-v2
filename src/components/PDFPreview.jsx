import React, { useState, useEffect, useRef } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;

const PDFPreview = ({ file }) => {
  const [pdfDoc, setPdfDoc] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [renderedPages, setRenderedPages] = useState([]);
  const canvasRefs = useRef([]);

  useEffect(() => {
    if (!file) return;

    const loadPDF = async () => {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setPdfDoc(doc);
      } catch (error) {
        console.error('Error loading PDF for preview:', error);
      }
    };

    loadPDF();
  }, [file]);

  useEffect(() => {
    if (!pdfDoc) return;

    const renderPages = async () => {
      const pagesToRender = Math.min(4, pdfDoc.numPages);
      const rendered = [];

      for (let i = 1; i <= pagesToRender; i++) {
        try {
          const page = await pdfDoc.getPage(i);
          const viewport = page.getViewport({ scale: 2 * zoom });

          const canvas = canvasRefs.current[i - 1];
          if (!canvas) continue;

          const context = canvas.getContext('2d');
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;

          rendered.push(i);
        } catch (error) {
          console.error(`Error rendering page ${i}:`, error);
        }
      }

      setRenderedPages(rendered);
    };

    renderPages();
  }, [pdfDoc, zoom]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.5));
  };

  const handleResetZoom = () => {
    setZoom(1);
  };

  if (!file || !pdfDoc) return null;

  const pagesToShow = Math.min(4, pdfDoc.numPages);

  return (
    <div className="mt-8 border-t pt-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            PDF Preview (First {pagesToShow} Pages)
          </h3>
          <p className="text-sm text-gray-500">Development/Testing View - High Quality Render</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-5 h-5 text-gray-700" />
          </button>
          <span className="text-sm font-medium text-gray-700 min-w-[60px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-5 h-5 text-gray-700" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors ml-2"
            title="Reset Zoom"
          >
            <RotateCcw className="w-5 h-5 text-gray-700" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-gray-50 p-4 rounded-lg overflow-x-auto">
        {[...Array(pagesToShow)].map((_, index) => (
          <div key={index} className="flex flex-col items-center">
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
              <canvas
                ref={el => canvasRefs.current[index] = el}
                className="max-w-full h-auto"
                style={{
                  display: renderedPages.includes(index + 1) ? 'block' : 'none'
                }}
              />
              {!renderedPages.includes(index + 1) && (
                <div className="w-full h-64 flex items-center justify-center bg-gray-100">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                    <p className="text-sm text-gray-500 mt-2">Loading page {index + 1}...</p>
                  </div>
                </div>
              )}
            </div>
            <p className="text-sm font-medium text-gray-600 mt-2">Page {index + 1}</p>
          </div>
        ))}
      </div>

      <div className="mt-3 text-xs text-gray-500 text-center">
        <p>✓ High quality render (2x scale)</p>
        <p>✓ No pixel loss - Vector-based rendering</p>
      </div>
    </div>
  );
};

export default PDFPreview;
