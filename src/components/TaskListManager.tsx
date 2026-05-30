/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Task } from '../types';
import { Plus, Trash2, Check, CornerDownRight, CheckSquare, Square, Flame, Calendar, PlusCircle, Mic, MicOff, Loader2, Sparkles, AlertCircle, Send, Volume2, VolumeX, RefreshCw, AudioLines } from 'lucide-react';
import { RoutineBlock } from '../types';
import { GoogleGenAI, SchemaType } from "@google/genai";

// --- DECLARE EXPLICIT GLOBAL WINDOW TYPINGS FOR THE NATIVE APK BRIDGE ---
declare global {
  interface Window {
    AndroidAIEngine?: {
      transcribe: (base64Audio: string, mimeType: string) => string | Promise<string>;
      chat: (message: string, historyJson: string, tasksJson: string, routineBlocksJson: string, currentTime: string) => string | Promise<string>;
    };
  }
}

interface TaskListManagerProps {
  tasks: Task[];
  onAddTask: (task: Omit<Task, 'id' | 'status'>) => void;
  onDeleteTask: (id: string) => void;
  onToggleStatus: (id: string) => void;
  userApiKey?: string;
  onUpdateAllTasks?: (tasks: Task[]) => void;
  onUpdateScore?: (score: number) => void;
  onUpdateExplanation?: (explanation: string) => void;
  routineBlocks?: RoutineBlock[];
  currentTime?: string;
}

export default function TaskListManager({
  tasks,
  onAddTask,
  onDeleteTask,
  onToggleStatus,
  userApiKey,
  onUpdateAllTasks,
  onUpdateScore,
  onUpdateExplanation,
  routineBlocks = [],
  currentTime = "08:00",
}: TaskListManagerProps) {
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(30);
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [preferredWindow, setPreferredWindow] = useState<'morning' | 'afternoon' | 'evening' | 'any'>('any');
  const [isDeepWork, setIsDeepWork] = useState(false);
  const [notes, setNotes] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [pttState, setPttState] = useState<'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'error'>('idle');
  const [pttTranscription, setPttTranscription] = useState("");
  const [pttReply, setPttReply] = useState("");
  const [pttError, setPttError] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // --- STATE FOR STATEFUL PUSH-TO-TALK CHAT MEMORY ---
  const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'model'; text: string }[]>(() => {
    const saved = localStorage.getItem('gpt_chat_history');
    return saved ? JSON.parse(saved) : [
      {
        role: 'model',
        text: "Hi! I'm Gemini, your personal assistant. Push and hold the mic to dump tasks on your mind—I'll strategically schedule them and reply via audio."
      }
    ];
  });
  const [voiceFeedbackEnabled, setVoiceFeedbackEnabled] = useState(() => {
    const saved = localStorage.getItem('gpt_voice_playback');
    return saved !== 'false';
  });

  // Sync state helpers
  useEffect(() => {
    localStorage.setItem('gpt_chat_history', JSON.stringify(chatHistory));
  }, [chatHistory]);

  useEffect(() => {
    localStorage.setItem('gpt_voice_playback', String(voiceFeedbackEnabled));
  }, [voiceFeedbackEnabled]);

  const speakResponse = (text: string, onEndCallback?: () => void) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleanText = text
        .replace(/[*#`_\-]/g, '')
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Google')) ||
                           voices.find(v => v.lang.startsWith('en')) || 
                           voices[0];
      if (englishVoice) {
        utterance.voice = englishVoice;
      }
      if (onEndCallback) {
        utterance.onend = () => onEndCallback();
        utterance.onerror = () => onEndCallback();
      }
      window.speechSynthesis.speak(utterance);
    } else {
      if (onEndCallback) onEndCallback();
    }
  };

  const getBase64 = (file: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const isHoldingPTT = useRef(false);

  const startPTT = async () => {
    if (pttState !== 'idle') return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    isHoldingPTT.current = true;
    setPttState('listening');
    setPttTranscription("");
    setPttReply("");
    setPttError("");
    audioChunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // If user released the button while we were waiting for the mic permission
      if (!isHoldingPTT.current) {
        stream.getTracks().forEach(track => track.stop());
        setPttState('idle');
        return;
      }

      let mimeType = "audio/webm";
      if (MediaRecorder.isTypeSupported("audio/webm")) {
        mimeType = "audio/webm";
      } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
        mimeType = "audio/ogg";
      } else if (MediaRecorder.isTypeSupported("audio/wav")) {
        mimeType = "audio/wav";
      } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
        mimeType = "audio/mp4";
      }

      const options = { mimeType };
      const mediaRecorder = new MediaRecorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });

        // Clean up tracks after recording is fully stopped
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        if (audioChunksRef.current.length > 0) {
          await handlePTTProcess(audioBlob, mimeType);
        } else {
          setPttState('idle');
        }
      };

      // Start recording with a small timeslice to ensure dataavailable fires
      mediaRecorder.start(200);
    } catch (err: any) {
      console.error("PTT microphone error:", err);
      setPttError(
        err?.name === "NotAllowedError" || err?.name === "PermissionDeniedError"
          ? "Microphone access blocked. Please allow mic permissions in your browser."
          : err?.message || "Lacks microphone permission."
      );
      setPttState('error');
      isHoldingPTT.current = false;
    }
  };

  const stopPTT = () => {
    isHoldingPTT.current = false;
    // Immediately move to transcribing UI if we were listening
    if (pttState === 'listening') {
      setPttState('transcribing');
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    } else {
      // If we stop before MediaRecorder was even started (waiting for promise)
      // and it didn't transition via onstop, go back to idle
      if (pttState === 'listening' || pttState === 'transcribing') {
         setTimeout(() => {
           if (pttState === 'transcribing' && audioChunksRef.current.length === 0) {
             setPttState('idle');
           }
         }, 500);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    }
  };

  const handlePTTProcess = async (blob: Blob, mimeType: string) => {
    if (!userApiKey) {
      setPttError("Please enter your Gemini API Key in the 'Key Config' (CPU icon) at the top of the app to use voice features without a server.");
      setPttState('error');
      return;
    }

    setPttState('transcribing');
    try {
      const base64Audio = await getBase64(blob);
      const genAI = new GoogleGenAI(userApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      // 1. Transcribe locally
      const transcriptionResult = await model.generateContent([
        {
          inlineData: {
            mimeType: mimeType || "audio/webm",
            data: base64Audio,
          },
        },
        "Transcribe this speech recording. Capture all task details spoken. Output ONLY the raw transcribed text. If empty, output an empty string."
      ]);

      const text = transcriptionResult.response.text().trim();

      if (!text) {
        throw new Error("No speech detected. Please speak clearly!");
      }

      setPttTranscription(text);
      setPttState('thinking');

      // 2. Chat/Process locally
      const chatModel = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        }
      });

      const systemPrompt = `You are "Gemini Planner Bot", a specialized conversational day planner similar to what Gemini for Google Workspace would be like.
The user is having a continuous conversational "Brain Dump" session with you. They will tell you everything they need to do, changes they want, or schedule queries in a stream of consciousness.
Your job is to talk back to them, converse naturally, ask for missing things (like duration, priority, preferred windows), and strategically place things in the calendar.

Current time of scheduling: ${currentTime || "08:00"}.

Here are their routine blocks mapping their daily constraints:
${JSON.stringify(routineBlocks, null, 2)}

You are stateful. Under "updatedTasks" in your JSON output, return the entire revised list of Tasks:
- If they ask to add a task, do so! Fabricate a unique id (like 'task-[timestamp]'), set reasonable default properties.
- If they request to change, reschedule, remove, adjust, or check off tasks, make the change and return the revised tasks!
- Ensure tasks DO NOT overlap with other tasks 'assignedTime' and do not overlap locked routine blocks.

Your response MUST be valid JSON.
In your response "reply" field: speak directly to the user (1-3 sentences) in a warm, competent tone.`;

      const chatResult = await chatModel.generateContent([
        systemPrompt,
        `Current Time: ${currentTime}, Tasks: ${JSON.stringify(tasks)}, Message: ${text}`
      ]);

      const responseData = JSON.parse(chatResult.response.text());

      setPttReply(responseData.reply);
      setChatHistory(prev => [...prev, { role: 'user', text }, { role: 'model', text: responseData.reply }]);

      if (responseData.updatedTasks && onUpdateAllTasks) {
        onUpdateAllTasks(responseData.updatedTasks);
      }
      if (typeof responseData.productivityScore === 'number' && onUpdateScore) {
        onUpdateScore(responseData.productivityScore);
      }
      if (responseData.explanation && onUpdateExplanation) {
        onUpdateExplanation(responseData.explanation);
      }

      setPttState('speaking');
      speakResponse(responseData.reply, () => setPttState('idle'));

    } catch (err: any) {
      console.error(err);
      setPttError(err.message || "Speech analyzer error.");
      setPttState('error');
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAddTask({
      title,
      duration,
      priority,
      preferredWindow,
      isDeepWork,
      notes,
    });
    // Reset
    setTitle("");
    setDuration(30);
    setPriority('medium');
    setPreferredWindow('any');
    setIsDeepWork(false);
    setNotes("");
    setShowAddForm(false);
  };

  const durationPresets = [15, 30, 45, 60, 90, 120];

  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 geometric-grid overflow-y-auto">
      {/* Add Task Control Button */}
      <div className="grid grid-cols-3 items-center border-b border-slate-200 pb-2.5 bg-white/75 backdrop-blur-xs p-2.5 gap-2 rounded-sm z-10">
        <div className="text-left">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Inbox ({tasks.length})</h2>
        </div>        <div className="flex flex-col items-center justify-center py-2">
          {/* Push-to-Talk Voice input Button */}
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              startPTT();
            }}
            onMouseUp={(e) => {
              e.preventDefault();
              stopPTT();
            }}
            onMouseLeave={(e) => {
              if (pttState === 'listening') {
                e.preventDefault();
                stopPTT();
              }
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              if ('vibrate' in navigator) {
                navigator.vibrate(20);
              }
              startPTT();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopPTT();
            }}
            onTouchCancel={(e) => {
              if (pttState === 'listening') {
                e.preventDefault();
                stopPTT();
              }
            }}
            className={`h-22 w-22 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all border duration-200 shadow-lg active:scale-95 select-none touch-none ${
              pttState === 'listening'
                ? 'bg-rose-650 text-white border-rose-550 shadow-xl shadow-rose-200 scale-110'
                : pttState === 'transcribing'
                ? 'bg-amber-500 text-white border-amber-440 scale-105 shadow-md shadow-amber-200 animate-pulse'
                : pttState === 'thinking'
                ? 'bg-indigo-650 text-white border-indigo-550 scale-105 shadow-md shadow-indigo-205'
                : pttState === 'speaking'
                ? 'bg-emerald-600 text-white border-emerald-500 scale-105 shadow-md shadow-emerald-250'
                : 'bg-slate-50 hover:bg-slate-100 text-indigo-600 border-slate-205 hover:border-slate-350 hover:scale-105'
            }`}
            title="Push-to-Talk (Hold to Speak, Release to Plan)"
          >
            {pttState === 'listening' ? (
              <Mic className="h-10 w-10 shrink-0 text-white animate-pulse" />
            ) : pttState === 'speaking' ? (
              <Volume2 className="h-10 w-10 shrink-0 text-white animate-bounce" />
            ) : pttState === 'thinking' || pttState === 'transcribing' ? (
              <Loader2 className="h-10 w-10 shrink-0 text-white animate-spin" />
            ) : (
              <AudioLines className="h-10 w-10 shrink-0" />
            )}
          </button>
          
          <span className="text-[8px] font-mono font-extrabold uppercase tracking-wider text-slate-400 mt-2 text-center leading-none">
            {pttState === 'listening' ? "Release to Send" :
             pttState === 'transcribing' ? "Transcribing..." :
             pttState === 'thinking' ? "Thinking..." :
             pttState === 'speaking' ? "Gemini Speaking" :
             "Hold & Speak"}
          </span>
        </div>

        <div className="flex justify-end">
          {/* Core manually trigger */}
          <button
            onClick={() => {
              setShowAddForm(!showAddForm);
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded-sm text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-all border shrink-0 ${
              showAddForm 
                ? 'bg-slate-100 text-slate-600 border-slate-350' 
                : 'bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-200 shadow-3xs'
            }`}
          >
            <Plus className="h-3 w-3 shrink-0 text-slate-400" />
            {showAddForm ? "Hide" : "Add Task"}
          </button>
        </div>
      </div>

    {/* Elegant Stateful PTT Status and Transcript Board */}
    {pttState !== 'idle' && (
      <div className="bg-slate-900 border border-slate-850 text-white p-4 rounded-sm space-y-3 shadow-xl z-20 animate-fadeIn relative flex flex-col">
        {/* Header bar of PTT status */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-2 shrink-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse" />
            <span className="text-[9px] uppercase font-mono font-extrabold tracking-widest text-slate-250">
              {pttState === 'listening' && "🔴 Recording Mic..."}
              {pttState === 'transcribing' && "⚡ Decoding Audiowave..."}
              {pttState === 'thinking' && "🧠 Gemini Rescheduling..."}
              {pttState === 'speaking' && "🔊 Assistant Speaking..."}
              {pttState === 'error' && "⚠️ Error Spotted"}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Feedback Volume Toggle */}
            <button
              type="button"
              onClick={() => setVoiceFeedbackEnabled(!voiceFeedbackEnabled)}
              className={`p-1 rounded-sm border cursor-pointer transition-colors ${
                voiceFeedbackEnabled ? 'bg-indigo-605/20 border-indigo-500/35 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-500'
              }`}
              title={voiceFeedbackEnabled ? "Mute Speech Out" : "Unmute Speech Out"}
            >
              {voiceFeedbackEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            
            <button
              type="button"
              onClick={() => {
                window.speechSynthesis.cancel();
                setPttState('idle');
              }}
              className="px-2 py-1 rounded-xs bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-400 hover:text-slate-200 text-[8px] font-mono font-bold uppercase cursor-pointer"
            >
              Close Indicator
            </button>
          </div>
        </div>

        <div className="space-y-3.5 text-xs">
          {/* User speech utterance transcription banner */}
          {pttTranscription && (
            <div className="bg-slate-850 border border-slate-800 p-2.5 rounded-sm">
              <span className="text-[8px] font-mono text-slate-400 block uppercase mb-1 font-bold">You Said:</span>
              <p className="text-slate-100 font-medium italic">"{pttTranscription}"</p>
            </div>
          )}

          {/* Gemini vocal response parsed copy */}
          {pttReply && (
            <div className="bg-indigo-950/25 border border-indigo-900/40 p-3 rounded-sm">
              <span className="text-[8px] font-mono text-indigo-400 block uppercase mb-1 font-extrabold">Gemini Assistant:</span>
              <p className="text-indigo-105 font-semibold leading-relaxed">{pttReply}</p>
            </div>
          )}

          {/* Audio processing activity lines if no text ready yet */}
          {!pttTranscription && !pttReply && (
            <div className="flex flex-col items-center justify-center py-5 space-y-2 select-none">
              {pttState === 'listening' && (
                <>
                  <div className="flex items-center space-x-1 justify-center h-12">
                    <span className="w-1.5 h-6 bg-rose-500 rounded-full animate-pulse" />
                    <span className="w-1.5 h-10 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                    <span className="w-1.5 h-8 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                    <span className="w-1.5 h-12 bg-rose-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    <span className="w-1.5 h-6 bg-rose-500 rounded-full animate-pulse" />
                  </div>
                  <span className="text-[10px] text-rose-400 font-mono font-medium animate-pulse">Capturing raw speech... keep button held down</span>
                </>
              )}
              {pttState === 'transcribing' && (
                <>
                  <Loader2 className="h-6 w-6 text-amber-400 animate-spin" />
                  <span className="text-[10px] text-amber-300 font-mono animate-pulse">Running advanced machine transcription...</span>
                </>
              )}
              {pttState === 'thinking' && (
                <>
                  <span className="flex space-x-1.5">
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                  <span className="text-[10px] text-indigo-400 font-mono animate-pulse">Calibrating schedule slots with Gemini...</span>
                </>
              )}
            </div>
          )}

          {pttError && (
            <div className="bg-rose-950/30 border border-rose-900/45 p-2.5 rounded-sm text-rose-450 text-[10.5px] font-mono font-bold">
              ⚠️ {pttError}
            </div>
          )}
        </div>
      </div>
    )}

      {/* Input Form wrapper */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-slate-200 p-4 rounded-sm space-y-3.5 shadow-md z-10 animate-fadeIn relative">
          <div>
            <label className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 font-mono mb-1">Task Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Draft proposal deck, Review code"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-sm text-xs placeholder-slate-400 text-slate-800 outline-none focus:border-indigo-600 focus:bg-white focus:ring-1 focus:ring-indigo-600/10"
            />
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 font-mono mb-1">Duration: {duration} mins</label>
            <div className="grid grid-cols-6 gap-1 mb-1.5">
              {durationPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDuration(preset)}
                  className={`py-1 text-[11px] font-mono font-bold rounded-sm border cursor-pointer transition-all ${
                    duration === preset
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 text-slate-500 border-slate-250 hover:text-slate-850'
                  }`}
                >
                  {preset}m
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 font-mono mb-1">Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-sm text-xs font-bold text-slate-755 outline-none focus:border-indigo-600"
              >
                <option value="high">🔴 High</option>
                <option value="medium">🟡 Medium</option>
                <option value="low">🔵 Low</option>
              </select>
            </div>

            <div>
              <label className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 font-mono mb-1">Preferred Time</label>
              <select
                value={preferredWindow}
                onChange={(e) => setPreferredWindow(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-sm text-xs font-bold text-slate-755 outline-none focus:border-indigo-600"
              >
                <option value="any">⏳ Any Time</option>
                <option value="morning">🌅 Morning (8-12)</option>
                <option value="afternoon">☀️ Afternoon (12-17)</option>
                <option value="evening">🌌 Evening (17-22)</option>
              </select>
            </div>
          </div>

          {/* Deep Focus Toggle */}
          <div className="flex items-center justify-between bg-slate-50 p-2.5 rounded-sm border border-slate-200">
            <div className="flex items-center gap-2">
              <Flame className={`h-4.5 w-4.5 ${isDeepWork ? 'text-indigo-600' : 'text-slate-400'}`} />
              <div>
                <span className="block text-xs font-bold text-slate-800">Requires Deep Focus</span>
                <span className="text-[10px] text-slate-400">Gemini blocks out adjacent noise for this task</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsDeepWork(!isDeepWork)}
              className={`w-10 h-6 flex items-center rounded-full p-0.5 cursor-pointer transition-colors duration-200 focus:outline-none ${
                isDeepWork ? 'bg-indigo-600' : 'bg-slate-300'
              }`}
            >
              <span className={`bg-white w-5 h-5 rounded-sm shadow-md transform transition-transform duration-200 ${
                isDeepWork ? 'translate-x-4' : 'translate-x-0'
              }`} />
            </button>
          </div>

          <div>
            <label className="block text-[9px] uppercase tracking-wider font-extrabold text-slate-400 font-mono mb-1">Task Specs / Notes</label>
            <input
              type="text"
              placeholder="Add optional notes, details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 px-3 py-2 rounded-sm text-xs placeholder-slate-400 text-slate-850 outline-none focus:border-indigo-600"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wider py-2 px-3 rounded-sm shadow-sm cursor-pointer transition-colors"
          >
            Add to Queue
          </button>
        </form>
      )}

      {/* Tasks display groups */}
      <div className="space-y-4 z-10">
        {/* Pending Sect */}
        <div>
          <h3 className="text-2xs font-extrabold uppercase tracking-widest text-slate-400 font-mono mb-2">Pending Tasks ({pendingTasks.length})</h3>
          <div className="space-y-2">
            {pendingTasks.map((task) => (
              <div 
                key={task.id} 
                className={`bg-white border border-slate-200 p-3 rounded-sm flex items-center justify-between gap-3 shadow-xs border-l-4 ${
                  task.priority === 'high' 
                    ? 'border-l-indigo-600' 
                    : task.priority === 'medium'
                    ? 'border-l-amber-550'
                    : 'border-l-blue-400'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <button 
                    onClick={() => onToggleStatus(task.id)}
                    className="text-slate-400 hover:text-indigo-600 mt-0.5 transition-colors cursor-pointer"
                  >
                    <Square className="h-4.5 w-4.5" />
                  </button>
                  <div>
                    <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                      {task.title}
                      {task.isDeepWork && (
                        <span className="inline-flex items-center text-[8px] font-extrabold px-1 rounded-sm bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono">
                          FOCUS
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono font-bold tracking-wide mt-1">
                      <span>⏱️ {task.duration}m</span>
                      <span>•</span>
                      <span className="capitalize">{task.preferredWindow === 'any' ? 'Flex Time' : task.preferredWindow}</span>
                      {task.assignedTime && (
                        <>
                          <span>•</span>
                          <span className="text-indigo-700 font-bold bg-indigo-50 px-1 rounded-sm border border-indigo-100/50">📅 {task.assignedTime}</span>
                        </>
                      )}
                    </div>
                    {task.notes && (
                      <p className="text-[10px] text-slate-400 italic mt-1">{task.notes}</p>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => onDeleteTask(task.id)}
                  className="text-slate-400 hover:text-rose-600 p-1.5 rounded-sm hover:bg-slate-50 transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            {pendingTasks.length === 0 && (
              <div className="flex flex-col py-8 px-4 items-center justify-center text-center bg-white border border-dashed border-slate-200 rounded-sm space-y-1.5 animate-fadeIn">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Inbox Empty</h4>
                <p className="text-[11px] text-slate-500 font-semibold leading-relaxed max-w-[240px]">
                  Tap the audio sensor above to speak with Gemini and schedule your day.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Completed Sect */}
        {completedTasks.length > 0 && (
          <div>
            <h3 className="text-2xs font-extrabold uppercase tracking-widest text-slate-400 font-mono mb-2">Completed Today ({completedTasks.length})</h3>
            <div className="space-y-1.5 opacity-65">
              {completedTasks.map((task) => (
                <div key={task.id} className="bg-slate-50 border border-slate-200 p-2.5 rounded-sm flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onToggleStatus(task.id)} className="text-indigo-600 cursor-pointer">
                      <CheckSquare className="h-4.5 w-4.5" />
                    </button>
                    <span className="line-through text-slate-400 font-medium">{task.title}</span>
                  </div>
                  <button
                    onClick={() => onDeleteTask(task.id)}
                    className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-slate-100 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
