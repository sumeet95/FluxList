/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Task } from '../types';
import { Plus, Trash2, Check, CornerDownRight, CheckSquare, Square, Flame, Calendar, PlusCircle, Mic, MicOff, Loader2, Sparkles, AlertCircle, Send, Volume2, VolumeX, RefreshCw, AudioLines, Clock } from 'lucide-react';
import { RoutineBlock } from '../types';
import { GoogleGenAI, SchemaType } from "@google/genai";

// --- DECLARE EXPLICIT GLOBAL WINDOW TYPINGS ---
declare global {
  interface Window {
    AndroidAIEngine?: {
      transcribe: (base64Audio: string, mimeType: string) => string | Promise<string>;
      chat: (message: string, historyJson: string, tasksJson: string, routineBlocksJson: string, currentTime: string) => string | Promise<string>;
    };
    AndroidNativeAudio?: {
      start: () => void;
      stop: () => void;
    };
    onNativeAudioResult?: (base64: string) => void;
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
  const isHoldingPTT = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

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

  useEffect(() => {
    localStorage.setItem('gpt_chat_history', JSON.stringify(chatHistory));
  }, [chatHistory]);

  useEffect(() => {
    localStorage.setItem('gpt_voice_playback', String(voiceFeedbackEnabled));
  }, [voiceFeedbackEnabled]);

  const speakResponse = (text: string, onEndCallback?: () => void) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleanText = text.replace(/[*#`_\-]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => { if (onEndCallback) onEndCallback(); };
      utterance.onerror = () => { if (onEndCallback) onEndCallback(); };
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

    if (window.AndroidNativeAudio) {
      window.onNativeAudioResult = (base64) => {
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'audio/m4a' });
        handlePTTProcess(blob, 'audio/m4a');
      };
      window.AndroidNativeAudio.start();
      return;
    }

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Microphone API is not supported. Use the native app.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      if (!isHoldingPTT.current) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
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

      mediaRecorder.start(200);
    } catch (err: any) {
      console.error("PTT microphone error:", err);
      setPttError(err?.message || "Lacks microphone permission.");
      setPttState('error');
      isHoldingPTT.current = false;
    }
  };

  const stopPTT = () => {
    isHoldingPTT.current = false;
    if (pttState === 'listening') {
      setPttState('transcribing');
    }

    if (window.AndroidNativeAudio) {
      window.AndroidNativeAudio.stop();
      return;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    } else {
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
      setPttError("Please enter your Gemini API Key in the 'Key Config' (CPU icon) at the top of the app.");
      setPttState('error');
      return;
    }

    setPttState('transcribing');
    try {
      const base64Audio = await getBase64(blob);
      const genAI = new GoogleGenAI(userApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const transcriptionResult = await model.generateContent([
        {
          inlineData: {
            mimeType: mimeType || "audio/webm",
            data: base64Audio,
          },
        },
        "Transcribe this speech recording. Capture all task details spoken. Output ONLY the raw transcribed text."
      ]);

      const text = transcriptionResult.response.text().trim();

      if (!text) {
        throw new Error("No speech detected. Please speak clearly!");
      }

      setPttTranscription(text);
      setPttState('thinking');

      const chatModel = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
        }
      });

      const systemPrompt = `You are "Gemini Planner Bot", a specialized conversational day planner. Speak directly to the user (1-3 sentences). Return valid JSON. Current Time: ${currentTime}. Routines: ${JSON.stringify(routineBlocks)}. Tasks: ${JSON.stringify(tasks)}.`;

      const chatResult = await chatModel.generateContent([
        systemPrompt,
        `User Message: ${text}`
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
    onAddTask({ title, duration, priority, preferredWindow, isDeepWork, notes });
    setTitle(""); setDuration(30); setPriority('medium'); setPreferredWindow('any'); setIsDeepWork(false); setNotes(""); setShowAddForm(false);
  };

  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 geometric-grid overflow-y-auto">
      <div className="grid grid-cols-3 items-center border-b border-slate-200 pb-2.5 bg-white/75 backdrop-blur-xs p-2.5 gap-2 rounded-sm z-10">
        <div className="text-left">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Inbox ({tasks.length})</h2>
        </div>
        <div className="flex flex-col items-center justify-center py-2">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); startPTT(); }}
            onMouseUp={(e) => { e.preventDefault(); stopPTT(); }}
            onTouchStart={(e) => { e.preventDefault(); if ('vibrate' in navigator) navigator.vibrate(20); startPTT(); }}
            onTouchEnd={(e) => { e.preventDefault(); stopPTT(); }}
            className={`h-22 w-22 rounded-full flex flex-col items-center justify-center cursor-pointer transition-all border duration-200 shadow-lg active:scale-95 select-none touch-none ${
              pttState === 'listening' ? 'bg-rose-650 text-white border-rose-550 shadow-xl shadow-rose-200 scale-110' :
              pttState === 'transcribing' ? 'bg-amber-500 text-white border-amber-440 scale-105 shadow-md shadow-amber-200 animate-pulse' :
              pttState === 'thinking' ? 'bg-indigo-650 text-white border-indigo-550 scale-105 shadow-md shadow-indigo-205' :
              pttState === 'speaking' ? 'bg-emerald-600 text-white border-emerald-500 scale-105 shadow-md shadow-emerald-250' :
              'bg-slate-50 hover:bg-slate-100 text-indigo-600 border-slate-205 hover:border-slate-350 hover:scale-105'
            }`}
          >
            {pttState === 'listening' ? <Mic className="h-10 w-10 shrink-0 text-white animate-pulse" /> :
             pttState === 'speaking' ? <Volume2 className="h-10 w-10 shrink-0 text-white animate-bounce" /> :
             pttState === 'thinking' || pttState === 'transcribing' ? <Loader2 className="h-10 w-10 shrink-0 text-white animate-spin" /> :
             <AudioLines className="h-10 w-10 shrink-0" />}
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
          <button onClick={() => setShowAddForm(!showAddForm)} className={`flex items-center gap-1 px-2 py-1 rounded-sm text-[9px] font-bold uppercase tracking-wider cursor-pointer transition-all border shrink-0 ${showAddForm ? 'bg-slate-100 text-slate-600 border-slate-350' : 'bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 border-slate-200 shadow-3xs'}`}>
            <Plus className="h-3 w-3 shrink-0 text-slate-400" />
            {showAddForm ? "Hide" : "Add Task"}
          </button>
        </div>
      </div>

      {pttState !== 'idle' && (
        <div className="bg-slate-900 border border-slate-850 text-white p-4 rounded-sm space-y-3 shadow-xl z-20 animate-fadeIn relative flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-indigo-400 animate-pulse" />
              <span className="text-[9px] uppercase font-mono font-extrabold tracking-widest text-slate-250">
                {pttState === 'listening' ? "Gemini Listening..." :
                 pttState === 'transcribing' ? "Processing Voice..." :
                 pttState === 'thinking' ? "Gemini Reasoning..." :
                 pttState === 'speaking' ? "Gemini Feedback" : "Analyzer Active"}
              </span>
            </div>
            <button onClick={() => setPttState('idle')} className="text-[8px] font-black uppercase text-slate-500 hover:text-slate-300 transition-colors">Close Indicator</button>
          </div>
          {pttError ? (
            <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-sm flex gap-3 items-start">
              <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
              <p className="text-[10px] text-rose-200 font-semibold leading-relaxed">{pttError}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pttTranscription && (
                <div className="space-y-1.5">
                  <span className="text-[8px] uppercase font-mono font-black text-indigo-400 tracking-wider">Your Input:</span>
                  <p className="text-xs text-slate-300 italic font-medium leading-relaxed">"{pttTranscription}"</p>
                </div>
              )}
              {pttReply && (
                <div className="space-y-1.5 animate-fadeIn">
                  <span className="text-[8px] uppercase font-mono font-black text-emerald-400 tracking-wider">Gemini Reply:</span>
                  <p className="text-[11px] text-slate-100 font-semibold leading-relaxed">{pttReply}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-slate-50 border border-slate-200 p-4 rounded-sm space-y-4 shadow-3xs animate-fadeIn z-10 shrink-0">
          <div className="space-y-1">
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 font-mono">Task Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Quarter Budget Review" className="w-full bg-white border border-slate-200 rounded-sm px-3 py-2 text-xs font-bold text-slate-800 placeholder-slate-300 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition-all" autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 font-mono">Priority</label>
              <div className="flex gap-1.5">
                {(['low', 'medium', 'high'] as const).map(p => (
                  <button key={p} type="button" onClick={() => setPriority(p)} className={`flex-1 py-1.5 rounded-xs text-[9px] font-black uppercase tracking-wider transition-all border ${priority === p ? (p === 'high' ? 'bg-rose-600 text-white border-rose-700 shadow-xs' : p === 'medium' ? 'bg-amber-500 text-white border-amber-600 shadow-xs' : 'bg-indigo-600 text-white border-indigo-700 shadow-xs') : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>{p}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-400 font-mono">Duration (mins)</label>
              <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="w-full bg-white border border-slate-200 rounded-sm px-2 py-1.5 text-xs font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500">
                {[15, 30, 45, 60, 90, 120].map(d => <option key={d} value={d}>{d}m</option>)}
              </select>
            </div>
          </div>
          <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-sm text-[10px] font-black uppercase tracking-widest transition-all shadow-xs flex items-center justify-center gap-2 active:scale-98">
            <PlusCircle className="h-3.5 w-3.5" />
            Add to Pending List
          </button>
        </form>
      )}

      <div className="space-y-6 pb-20">
        <div className="space-y-3">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-1.5">
            <Clock className="h-3 w-3 text-slate-300" />
            <h3 className="text-[9px] font-black uppercase tracking-widest text-slate-500 font-mono">Backlog / Pending</h3>
          </div>
          {pendingTasks.length === 0 ? (
            <div className="bg-slate-50/50 border border-dashed border-slate-200 p-8 rounded-sm text-center">
              <AudioLines className="h-6 w-6 text-slate-200 mx-auto mb-2" />
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Empty Backlog</p>
            </div>
          ) : (
            <div className="grid gap-2">
              {pendingTasks.map(task => (
                <div key={task.id} className="bg-white border border-slate-200 p-3 rounded-sm shadow-3xs flex items-center justify-between group hover:border-indigo-200 transition-colors">
                  <div className="flex items-center gap-3">
                    <button onClick={() => onToggleStatus(task.id)} className="h-5 w-5 rounded-xs border-2 border-slate-200 flex items-center justify-center hover:border-indigo-400 transition-colors bg-slate-50"><Square className="h-3 w-3 text-transparent" /></button>
                    <div>
                      <h4 className="text-[11px] font-bold text-slate-800 leading-tight">{task.title}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[7.5px] font-black uppercase tracking-wider px-1 py-0.5 rounded-xs border ${task.priority === 'high' ? 'bg-rose-50 text-rose-700 border-rose-100' : task.priority === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-100' : 'bg-slate-50 text-slate-500 border-slate-100'}`}>{task.priority}</span>
                        <span className="text-[7.5px] font-bold text-slate-400 uppercase tracking-widest font-mono">| {task.duration}m</span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => onDeleteTask(task.id)} className="p-1.5 text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
