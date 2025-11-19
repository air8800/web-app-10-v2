import express from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Serve static files from the dist directory
app.use(express.static(join(__dirname, '../dist')));

// Mock printer data
const mockPrinters = [
  {
    id: 'printer1',
    name: 'Network Printer 1',
    status: 'online',
    url: 'ipp://printer1.local:631/ipp/print',
    supportedSizes: ['A4', 'Letter', 'A3', 'Legal'],
    isDefault: true,
    lastActive: new Date(),
    description: 'IPP-enabled network printer'
  },
  {
    id: 'printer2',
    name: 'Network Printer 2',
    status: 'online',
    url: 'ipp://printer2.local:631/ipp/print',
    supportedSizes: ['A4', 'Letter'],
    isDefault: false,
    lastActive: new Date(),
    description: 'IPP-enabled network printer'
  }
];

// Function to discover network printers using IPP
async function discoverNetworkPrinters() {
  return mockPrinters;
}

// API Routes
app.get('/api/printers', async (req, res) => {
  try {
    const printers = await discoverNetworkPrinters();
    res.json(printers);
  } catch (error) {
    console.error('Error getting printers:', error);
    res.status(500).json({ 
      error: 'Failed to get printers',
      message: 'Error discovering network printers'
    });
  }
});

app.get('/api/printers/:id/capabilities', async (req, res) => {
  try {
    const printer = mockPrinters.find(p => p.id === req.params.id);
    
    if (!printer) {
      return res.status(404).json({ error: 'Printer not found' });
    }

    // Return mock capabilities directly from the printer data
    res.json(printer.supportedSizes);
  } catch (error) {
    console.error('Error getting printer capabilities:', error);
    res.status(500).json({ error: 'Failed to get printer capabilities' });
  }
});

app.post('/api/print', async (req, res) => {
  try {
    const { printerId, document, options } = req.body;
    const printer = mockPrinters.find(p => p.id === printerId);
    
    if (!printer) {
      return res.status(404).json({ error: 'Printer not found' });
    }

    console.log('Print job received:', {
      printer: printer.name,
      document,
      options
    });

    res.json({ 
      success: true,
      message: 'Print job submitted successfully',
      jobId: Math.random().toString(36).substr(2, 9)
    });
  } catch (error) {
    console.error('Error submitting print job:', error);
    res.status(500).json({ error: 'Failed to submit print job' });
  }
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, '../dist/index.html'));
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Print server running on port ${PORT} (Demo Mode)`);
});