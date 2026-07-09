// Import the Google Gen AI client library.
// We use the new, unified "@google/genai" package rather than the legacy "@google/generative-ai" package.
import { GoogleGenAI } from '@google/genai';

// Cache the GoogleGenAI client instance to reuse HTTP/TCP connections across warm worker requests
let cachedAi = null;
let cachedApiKey = null;

function getGeminiClient(apiKey) {
  if (cachedAi && cachedApiKey === apiKey) {
    return cachedAi;
  }
  cachedAi = new GoogleGenAI({ apiKey });
  cachedApiKey = apiKey;
  return cachedAi;
}

/**
 * Analyzes a health report file (PDF, JPG, PNG) using Google Gemini AI.
 * 
 * @param {Buffer} fileBuffer - The raw binary data of the uploaded file.
 * @param {string} mimeType - The MIME content type of the file (e.g., 'application/pdf', 'image/png').
 * @param {any} [env] - Optional runtime environment bindings containing the GEMINI_API_KEY.
 * @returns {Promise<{ success: boolean; data?: any; error?: string }>} - A promise resolving to the parsed analysis or an error.
 */
export async function analyzeReport(fileBuffer, mimeType, env) {
  const apiKey = env?.GEMINI_API_KEY || process.env.GEMINI_API_KEY || (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.GEMINI_API_KEY : undefined);
  
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not defined.');
  }

  const ai = getGeminiClient(apiKey);
  try {
    // Step 1: Validate input arguments
    if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
      throw new Error('A valid file Buffer must be provided to analyzeReport.');
    }
    if (!mimeType) {
      throw new Error('A valid file MIME type must be provided to analyzeReport.');
    }

    // Step 2: Convert the raw binary buffer into a base64 string.
    // The Gemini API requires inline binary data to be sent as a base64 encoded string.
    const base64Data = fileBuffer.toString('base64');

    // Step 3: Call the Gemini content generation endpoint.
    // We target the fast and lightweight "gemini-2.5-flash" model.
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      // We pass the prompt contents as an array containing the file's inline data and the instruction prompt.
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Data
          }
        },
        {
          text: "Extract clinical markers, status, and layperson explanations from this health report."
        }
      ],
      // We configure model constraints within the config property.
      config: {
        // System instruction forces the persona, guards against medical diagnosis, and mandates JSON output format.
        systemInstruction: "You are a health report interpreter. You explain lab report markers in simple, plain language. You NEVER diagnose. You always suggest consulting a doctor for anything concerning. Respond ONLY in valid JSON, no other text, no markdown code fences.",
        // Force the output to be raw JSON instead of plain markdown text.
        responseMimeType: "application/json",
        // Lower temperature makes token selection more deterministic, speeding up generation
        temperature: 0.1,
        // Define a strict JSON schema (Structured Outputs) to guide the model's generation directly and reduce latency
        responseSchema: {
          type: "OBJECT",
          properties: {
            report_type: { 
              type: "STRING", 
              description: "The name/type of the medical report (e.g. Complete Blood Count, Thyroid Panel)" 
            },
            markers: {
              type: "ARRAY",
              description: "List of all biomarkers detected in the report",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING", description: "Biomarker name (e.g. TSH, Hemoglobin)" },
                  value: { type: "STRING", description: "Value with units (e.g. 6.82 uIU/mL)" },
                  status: { type: "STRING", description: "Status (e.g. Normal, High, Low, Critical)" },
                  explanation: { type: "STRING", description: "Plain language layperson explanation of the marker and value" }
                },
                required: ["name", "value", "status", "explanation"]
              }
            },
            summary: { 
              type: "STRING", 
              description: "An empathetic, reassuring layperson summary of the overall report findings" 
            },
            action_plan: {
              type: "ARRAY",
              description: "Practical diet, lifestyle, or clinical follow-up advice to discuss with their doctor",
              items: { type: "STRING" }
            }
          },
          required: ["report_type", "markers", "summary", "action_plan"]
        }
      }
    });

    // Step 4: Extract and validate response content
    const responseText = response.text;
    if (!responseText) {
      throw new Error('The Gemini API returned an empty content response.');
    }

    // Step 5: Parse the returned JSON response string into a standard JavaScript object
    const parsedData = JSON.parse(responseText);

    return {
      success: true,
      data: parsedData
    };

  } catch (error) {
    // Step 6: Handle failures gracefully without crashing the server process.
    console.error('Error during Gemini report analysis:', error);
    return {
      success: false,
      error: error.message || 'An unexpected error occurred during report interpretation.'
    };
  }
}
