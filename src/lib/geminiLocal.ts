import { GoogleGenAI } from "@google/genai";

export async function optimizeScheduleLocal(apiKey: string, data: any) {
  const genAI = new GoogleGenAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const systemPrompt = `You are an expert personal productivity assistant... (Scheduling Rules apply)`;
  const userPrompt = `Context: ${JSON.stringify(data)}`;

  const result = await model.generateContent([systemPrompt, userPrompt]);
  return JSON.parse(result.response.text());
}

export async function transcribeAudioLocal(apiKey: string, base64Audio: string, mimeType: string) {
  const genAI = new GoogleGenAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: mimeType || "audio/webm",
        data: base64Audio,
      },
    },
    "Transcribe this speech recording. Output ONLY the raw transcribed text."
  ]);

  return result.response.text();
}
