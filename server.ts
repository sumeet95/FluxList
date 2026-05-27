/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

dotenv.config();

function handleGeminiError(error: any, res: express.Response, defaultMessage: string) {
  const errMsg = error?.message || "";
  const errStr = typeof error === 'object' ? JSON.stringify(error) : String(error);
  
  if (
    errMsg.toLowerCase().includes("quota") || 
    errMsg.toLowerCase().includes("limit") || 
    errMsg.toLowerCase().includes("exhausted") || 
    errStr.toLowerCase().includes("quota") || 
    errStr.toLowerCase().includes("limit") || 
    errStr.toLowerCase().includes("exhausted") || 
    error?.status === 429
  ) {
    return res.status(429).json({
      error: "QuotaExceeded",
      message: "The shared Gemini API free tier quota has been exhausted. You can resolve this immediately by pasting your own Gemini API Key into the 'Key Config' (CPU icon) box at the top of the screen!"
    });
  }

  res.status(500).json({
    error: defaultMessage,
    message: error?.message || "Internal Server Error"
  });
}

const app = express();
const PORT = 3000;

app.use(express.json());

// API: Check status & whether API key exists
app.get("/api/status", (req, res) => {
  res.json({
    status: "ok",
    hasApiKey: !!process.env.GEMINI_API_KEY,
  });
});

// API: Tasks Optimizer Endpoint
app.post("/api/schedule/optimize", async (req, res) => {
  const apiKey = (req.headers["x-gemini-api-key"] as string) || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: "Missing API Key",
      message: "No Gemini Key detected. Please enter your Gemini API Key in the 'Key Config' panel at the top of the app."
    });
  }

  const { tasks, routineBlocks, interruptions, currentTime } = req.body;

  try {
    // Lazy initialize Gemini Client
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const systemPrompt = `You are an expert personal productivity assistant and scheduler designed to structure daily plans for maximum human efficiency.
Your job is to schedule a list of tasks into available time slots or blocks, respecting constraints like priority, preferred windows, durational requirements, and deep focus compatibility.

Rules:
1. Daily Blocks: The user has defined routine blocks like Sleep, Meal, Work, Break. Some blocks are locked (isLocked: true, like sleep, meals, breaks) where NO tasks can be scheduled. Tasks must be assigned only to available, non-locked times.
2. Interruption Blocks: Treat any passed interruptions as absolute locked blocks. They override any pre-existing routines for their durations.
3. Current Time constraints: Tasks already completed (status === 'completed') should remain untouched at their previous times (if they have one), or omitted from rescheduling. ONLY schedule pending (or missed) tasks starting AFTER the current time: ${currentTime}.
4. Duration, Preference and Deep Focus Pairing:
   - High priority tasks should be scheduled first.
   - Deep work tasks should preferably be scheduled during the 'morning' or 'afternoon' work blocks, block-scheduling them sequentially to minimize task-switching.
   - Light tasks should fit smaller spaces (gaps, breaks or evening blocks).
   - Try to fulfill 'preferredWindow' (morning: 08:00-12:00, afternoon: 12:00-17:00, evening: 17:00-22:00, any: free schedule).
5. Work-Day boundary: Ensure all tasks fit within standard awake hours. NEVER schedule tasks during sleep hours.
6. Realism: Ensure start times and end times strictly make sense (e.g., end time = start time + duration). Do not overlap scheduled tasks. If a task cannot fit in the available blocks for the day, list it in the 'unresolvedTasks' section with a helpful warning of why (e.g. 'Day is full', 'Sleep block overlap').

Output a structured JSON list of slot assignments, with a productivity score out of 100, and a concise explanation (in Markdown format) of your scheduling strategy (e.g. why tasks were grouped or shifted).`;

    const userPrompt = `
Here are the current parameters to optimize:
- CURRENT TIME FOR SCHEDULING: ${currentTime || "08:00"} (do not schedule any new tasks before this time)
- ROUTINE BLOCKS:
${JSON.stringify(routineBlocks, null, 2)}

- INTERRUPTIONS / BLOCKED TIMES:
${JSON.stringify(interruptions, null, 2)}

- PENIDNG TASKS TO SCHEDULE:
${JSON.stringify(tasks.filter((t: any) => t.status !== "completed"), null, 2)}

- ALREADY COMPLETED TASKS (keep these exactly as they are if assigned, or if they have an assignedTime, preserve their timings if completed):
${JSON.stringify(tasks.filter((t: any) => t.status === "completed"), null, 2)}

Please fit the tasks into the free intervals of the day. Match them with routine blocks of type 'work' or other available blocks, making sure to avoid meals and sleep. Add any unresolved tasks to 'unresolvedTasks' list. Provide an elegant personal productivity score (0-100) and an encouraging markdown analysis of the day under 'explanation'.
`;

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["scheduledItems", "explanation", "productivityScore", "unresolvedTasks"],
          properties: {
            scheduledItems: {
              type: Type.ARRAY,
              description: "The list of scheduled task items mapped onto the timeline.",
              items: {
                type: Type.OBJECT,
                required: ["taskId", "taskTitle", "startTime", "endTime", "isDeepWork", "priority"],
                properties: {
                  taskId: { type: Type.STRING },
                  taskTitle: { type: Type.STRING },
                  startTime: { type: Type.STRING, description: "Start time of the task in HH:MM format (24h)" },
                  endTime: { type: Type.STRING, description: "End time of the task in HH:MM format (24h)" },
                  isDeepWork: { type: Type.BOOLEAN },
                  priority: { type: Type.STRING }
                }
              }
            },
            explanation: {
              type: Type.STRING,
              description: "Markdown description of the scheduling reasoning, priority handling, and general advice."
            },
            productivityScore: {
              type: Type.INTEGER,
              description: "A customized dynamic productivity index rating, from 0 to 100."
            },
            unresolvedTasks: {
              type: Type.ARRAY,
              description: "Tasks that could not fit into the available blocks.",
              items: {
                type: Type.OBJECT,
                required: ["taskId", "title", "reason"],
                properties: {
                  taskId: { type: Type.STRING },
                  title: { type: Type.STRING },
                  reason: { type: Type.STRING }
                }
              }
            }
          }
        }
      }
    });

    const resText = response.text || "{}";
    const data = JSON.parse(resText.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Gemini Optimization Error:", error);
    handleGeminiError(error, res, "Optimization failed");
  }
});

// API: Voice Task parsing with Gemini
app.post("/api/voice-task", async (req, res) => {
  const apiKey = (req.headers["x-gemini-api-key"] as string) || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: "Missing API Key",
      message: "No Gemini Key detected. Please enter your Gemini API Key in the 'Key Config' panel at the top of the app."
    });
  }

  const { audioData, mimeType } = req.body;
  if (!audioData) {
    return res.status(400).json({ error: "Missing audioData" });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const systemPrompt = `You are a specialized voice-to-task parsing assistant.
Analyze the user's spoken task instruction. Listen to their speech, extract the task name/details precisely, and map them to a structured task JSON format.

Output properties:
1. title: Actionable, descriptive name of the task. (Short, clear, e.g., "Draft Quarter Budget Proposal").
2. duration: Expected time to complete in minutes (must be an integer, e.g., 15, 30, 45, 60, 90, 120. Standardize to these if they say 'an hour' use 60, 'half hour' use 30, default to 30 if not specified).
3. priority: Must be one of: 'high', 'medium', or 'low' (default to 'medium' if not mentioned / unclear).
4. preferredWindow: Match requested time of day: 'morning', 'afternoon', 'evening', or 'any' (default to 'any' if not mentioned / unclear).
5. isDeepWork: Boolean. True if the task requires deep focus, concentration, or uninterrupted quiet work. Otherwise false.
6. notes: Additional details, specs, comments, reminders, or subtasks mentioned in the voice note. If none, keep empty.

Ensure your entire output is valid JSON matching the schema structure.`;

    const audioPart = {
      inlineData: {
        mimeType: mimeType || "audio/webm",
        data: audioData,
      },
    };

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        audioPart,
        "Analyze this audio file and return a structured details object of the spoken task."
      ],
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["title", "duration", "priority", "preferredWindow", "isDeepWork", "notes"],
          properties: {
            title: { type: Type.STRING },
            duration: { type: Type.INTEGER },
            priority: { type: Type.STRING, description: "Must be: high, medium, low" },
            preferredWindow: { type: Type.STRING, description: "Must be: morning, afternoon, evening, any" },
            isDeepWork: { type: Type.BOOLEAN },
            notes: { type: Type.STRING }
          }
        }
      }
    });

    const resText = response.text || "{}";
    const data = JSON.parse(resText.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Gemini Voice Task Parsing Error:", error);
    handleGeminiError(error, res, "Speech processing failed");
  }
});

// API: Brain Dump Conversational Chat Endpoint
app.post("/api/brain-dump/chat", async (req, res) => {
  const apiKey = (req.headers["x-gemini-api-key"] as string) || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: "Missing API Key",
      message: "No Gemini Key detected. Please enter your Gemini API Key in the 'Key Config' panel at the top of the app."
    });
  }

  const { message, history, tasks, routineBlocks, currentTime } = req.body;

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const systemPrompt = `You are "Gemini Planner Bot", a specialized conversational day planner similar to what Gemini for Google Workspace would be like.
The user is having a continuous conversational "Brain Dump" session with you. They will tell you everything they need to do, changes they want, or schedule queries in a stream of consciousness.
Your job is to talk back to them, converse naturally, ask for missing things (like duration, priority, preferred windows), and strategically place things in the calendar.

Current time of scheduling: ${currentTime || "08:00"}.

Here are their routine blocks mapping their daily constraints (locked slots like Sleep, Meals, and personal routines, versus non-locked 'work' blocks where tasks CAN be strategically placed):
${JSON.stringify(routineBlocks, null, 2)}

You are stateful. We pass you the existing tasks in their tracker. Under "updatedTasks" in your JSON output, return the entire revised list of Tasks:
- If they ask to add a task, do so! Fabricate a unique id (like 'task-[timestamp]'), set reasonable default properties if they aren't mentioned (duration: 30, priority: 'medium', preferredWindow: 'any', isDeepWork: false, status: 'pending'), but STRATEGICALLY find a vacant, non-locked slot for it after the current time (${currentTime}) and assign it via 'assignedTime' property (e.g. '09:30').
- If they request to change, reschedule, remove, adjust, or check off tasks, make the change and return the revised tasks!
- Ensure tasks DO NOT overlap with other tasks 'assignedTime' and do not overlap locked routine blocks (like sleep or lunch). Keep it highly logical.

Your response MUST be valid JSON adhering exactly to the schema.
In your response "reply" field: speak directly to the user (1-3 sentences) in a warm, competent tone, explaining what tasks you strategically placed, adjusted, or deleted, and ask a proactive follow-up question (e.g. asking for missing durations, priority, or what else they want to dump).`;

    const contents = [];
    if (history && history.length > 0) {
      for (const h of history) {
        contents.push({
          role: h.role === 'model' ? 'model' : 'user',
          parts: [{ text: h.text }]
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [{
        text: `CONTEXT ENVIRONMENT:
Current Time is: ${currentTime || "08:00"}
Current Tasks tracker list: ${JSON.stringify(tasks || [], null, 2)}

USER MESSAGE:
"${message}"`
      }]
    });

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          required: ["reply", "updatedTasks", "productivityScore", "explanation"],
          properties: {
            reply: { type: Type.STRING },
            updatedTasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                required: ["id", "title", "duration", "priority", "preferredWindow", "status", "isDeepWork"],
                properties: {
                  id: { type: Type.STRING },
                  title: { type: Type.STRING },
                  duration: { type: Type.INTEGER },
                  priority: { type: Type.STRING, description: "high, medium, low" },
                  preferredWindow: { type: Type.STRING, description: "morning, afternoon, evening, any" },
                  status: { type: Type.STRING, description: "pending, completed, missed" },
                  isDeepWork: { type: Type.BOOLEAN },
                  assignedTime: { type: Type.STRING, nullable: true },
                  notes: { type: Type.STRING }
                }
              }
            },
            productivityScore: { type: Type.INTEGER },
            explanation: { type: Type.STRING }
          }
        }
      }
    });

    const resText = response.text || "{}";
    res.json(JSON.parse(resText.trim()));
  } catch (error: any) {
    console.error("Gemini Brain Dump Conversational Chat Error:", error);
    handleGeminiError(error, res, "Brain dump analysis failed");
  }
});

// API: Audio Transcription Endpoint for Chat Voice Support
app.post("/api/brain-dump/transcribe", async (req, res) => {
  const apiKey = (req.headers["x-gemini-api-key"] as string) || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(400).json({
      error: "Missing API Key",
      message: "No Gemini Key detected. Please enter your Gemini API Key in the 'Key Config' panel at the top of the app."
    });
  }

  const { audioData, mimeType } = req.body;
  if (!audioData) {
    return res.status(400).json({ error: "Missing audioData" });
  }

  try {
    const ai = new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });

    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType || "audio/webm",
            data: audioData,
          },
        },
        "Transcribe this speech recording. Capture all task details spoken. Output ONLY the raw transcribed text. If the recording is empty/silent, just output an empty string."
      ]
    });

    res.json({ text: response.text || "" });
  } catch (error: any) {
    console.error("Gemini Translation Error:", error);
    handleGeminiError(error, res, "Audio translation failed");
  }
});

// Configure Vite middleware and static asset serving
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
