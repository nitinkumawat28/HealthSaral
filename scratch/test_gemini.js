import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file manually first
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach(line => {
    const matched = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (matched) {
      const key = matched[1];
      let value = matched[2] || '';
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value;
    }
  });
}

// Now dynamically import gemini-client.js so it sees process.env
const { analyzeReport } = await import('../src/lib/gemini-client.js');

async function run() {
  try {
    console.log('Using GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? 'Present' : 'Missing');
    
    // Read the sample report image
    const filePath = path.join(__dirname, 'sample_report.png');
    if (!fs.existsSync(filePath)) {
      throw new Error(`Sample report file not found at: ${filePath}`);
    }
    
    const fileBuffer = fs.readFileSync(filePath);
    const mimeType = 'image/png';
    
    console.log(`Starting Gemini analysis of ${filePath} (${fileBuffer.length} bytes, type ${mimeType})...`);
    const result = await analyzeReport(fileBuffer, mimeType);
    
    console.log('Analysis Result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Test run failed:', error);
  }
}

run();
