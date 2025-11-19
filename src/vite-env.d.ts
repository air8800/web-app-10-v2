/// <reference types="vite/client" />

interface Window {
  electron: {
    getPrinters: () => Promise<any[]>;
    printDocument: (data: any) => Promise<any>;
    getSettings: () => Promise<any>;
    saveSettings: (settings: any) => Promise<boolean>;
    window: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  };
}