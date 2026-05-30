/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import PhoneFrame from './components/PhoneFrame';
import ActiveTask from './components/ActiveTask';
import TaskListManager from './components/TaskListManager';
import RoutineConfig from './components/RoutineConfig';
import { Task, RoutineBlock, Interruption, ScheduleItem, OptimizationResponse } from './types';
import { Calendar, CheckSquare, Settings, Sparkles, Clock, Compass, Grid, AlertCircle, RefreshCw, Cpu, Flame } from 'lucide-react';

const DEFAULT_ROUTINES: RoutineBlock[] = [
  { id: 'r1', name: 'Sleep Period', type: 'sleep', startTime: '22:00', endTime: '06:00', isLocked: true },
  { id: 'r2', name: 'Morning Routine & Prep', type: 'personal', startTime: '06:30', endTime: '08:00', isLocked: true },
  { id: 'r3', name: 'Deep Work Slot 1', type: 'work', startTime: '09:00', endTime: '12:00', isLocked: false },
  { id: 'r4', name: 'Lunch & Breakout', type: 'meal', startTime: '12:00', endTime: '13:00', isLocked: true },
  { id: 'r5', name: 'Work Slot 2', type: 'work', startTime: '13:00', endTime: '17:00', isLocked: false },
  { id: 'r6', name: 'Dinner & Winddown', type: 'meal', startTime: '18:00', endTime: '19:30', isLocked: true },
];

const DEFAULT_TASKS: Task[] = [];

export default function App() {
  // State variables
  const [tasks, setTasks] = useState<Task[]>(() => {
    const local = localStorage.getItem('gpt_tasks');
    return local ? JSON.parse(local) : DEFAULT_TASKS;
  });

  const [routineBlocks, setRoutineBlocks] = useState<RoutineBlock[]>(() => {
    const local = localStorage.getItem('gpt_routines');
    return local ? JSON.parse(local) : DEFAULT_ROUTINES;
  });

  const [interruptions, setInterruptions] = useState<Interruption[]>(() => {
    const local = localStorage.getItem('gpt_interruptions');
    return local ? JSON.parse(local) : [];
  });

  const [scheduledItems, setScheduledItems] = useState<ScheduleItem[]>(() => {
    const local = localStorage.getItem('gpt_scheduled');
    return local ? JSON.parse(local) : [];
  });

  const [unresolvedTasks, setUnresolvedTasks] = useState<{ taskId: string; title: string; reason: string }[]>(() => {
    const local = localStorage.getItem('gpt_unresolved');
    return local ? JSON.parse(local) : [];
  });

  const [currentTime, setCurrentTime] = useState<string>("08:00");
  const [productivityScore, setProductivityScore] = useState<number>(() => {
    const local = localStorage.getItem('gpt_score');
    return local ? Number(local) : 100;
  });

  const [explanation, setExplanation] = useState<string>(() => {
    const local = localStorage.getItem('gpt_explanation');
    return local ? local : "Your workspace is clean. Go to the **Brain Dump** tab to register tasks you want to work on, then trigger **Optimize** to calibrate your focus blocks!";
  });

  const [activeTab, setActiveTab] = useState<'schedule' | 'tasks' | 'routine'>('schedule');
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(true);
  const [calibrationRequired, setCalibrationRequired] = useState(true);
  const [loadingStep, setLoadingStep] = useState("");
  const [userApiKey, setUserApiKey] = useState<string>("AIzaSyD0XnjBImbd6ESU--_lzDmB5gk-18nrU_0");
  const [showKeySettings, setShowKeySettings] = useState(false);

  // Sync custom key to storage (optional now since hardcoded, but kept for overrides)
  useEffect(() => {
    if (userApiKey !== "YOUR_GEMINI_API_KEY_HERE") {
      localStorage.setItem('user_gemini_api_key', userApiKey);
    }
  }, [userApiKey]);

  // Check API key availability
  useEffect(() => {
    // No longer needed as we are standalone
    setHasApiKey(true);
  }, []);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('gpt_tasks', JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    localStorage.setItem('gpt_routines', JSON.stringify(routineBlocks));
  }, [routineBlocks]);

  useEffect(() => {
    localStorage.setItem('gpt_interruptions', JSON.stringify(interruptions));
  }, [interruptions]);

  useEffect(() => {
    localStorage.setItem('gpt_scheduled', JSON.stringify(scheduledItems));
    localStorage.setItem('gpt_unresolved', JSON.stringify(unresolvedTasks));
    localStorage.setItem('gpt_score', String(productivityScore));
    localStorage.setItem('gpt_explanation', explanation);
  }, [scheduledItems, unresolvedTasks, productivityScore, explanation]);

  const handleClearSlate = () => {
    if (window.confirm("Are you sure you want to clear all tasks, schedules, and start with a blank slate?")) {
      setTasks([]);
      setScheduledItems([]);
      setUnresolvedTasks([]);
      setInterruptions([]);
      setProductivityScore(100);
      setExplanation("Workspace cleared. Go to the **Brain Dump** tab to register tasks you want to work on, then trigger **Optimize** to calibrate your focus tracks!");
      setCalibrationRequired(false);
      localStorage.removeItem('gpt_tasks');
      localStorage.removeItem('gpt_scheduled');
      localStorage.removeItem('gpt_unresolved');
      localStorage.removeItem('gpt_interruptions');
      localStorage.removeItem('gpt_score');
      localStorage.removeItem('gpt_explanation');
    }
  };

  const handleToggleTaskStatus = (taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        const nextStatus = t.status === 'completed' ? 'pending' : 'completed';
        return { ...t, status: nextStatus };
      }
      return t;
    }));
    setCalibrationRequired(true);
  };

  const handleShuffleTask = (taskId: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        let nextPriority: 'high' | 'medium' | 'low' = t.priority;
        if (t.priority === 'high') {
          nextPriority = 'medium';
        } else if (t.priority === 'medium') {
          nextPriority = 'low';
        }
        return {
          ...t,
          priority: nextPriority,
          shuffledAt: Date.now(),
          assignedTime: null
        };
      }
      return t;
    }));
    setCalibrationRequired(true);
  };

  const handleAddTask = (newTask: Omit<Task, 'id' | 'status'>) => {
    const task: Task = {
      ...newTask,
      id: `task-${Date.now()}`,
      status: 'pending'
    };
    setTasks(prev => [...prev, task]);
    setCalibrationRequired(true);
  };

  const handleDeleteTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
    setScheduledItems(prev => prev.filter(s => s.taskId !== id));
    setCalibrationRequired(true);
  };

  const handleUpdateRoutineBlock = (id: string, updates: Partial<RoutineBlock>) => {
    setRoutineBlocks(prev => prev.map(b => b.id === id ? { ...b, ...updates } : b));
    setCalibrationRequired(true);
  };

  const handleUpdateRoutineTime = (id: string, startTime: string, endTime: string) => {
    setRoutineBlocks(prev => prev.map(b => b.id === id ? { ...b, startTime, endTime } : b));
    setCalibrationRequired(true);
  };

  const handleAddRoutine = (block: Omit<RoutineBlock, 'id'>) => {
    const newBlock: RoutineBlock = {
      ...block,
      id: `routine-${Date.now()}`
    };
    setRoutineBlocks(prev => [...prev, newBlock]);
    setCalibrationRequired(true);
  };

  const handleRemoveRoutine = (id: string) => {
    setRoutineBlocks(prev => {
      const target = prev.find(b => b.id === id);
      if (!target) return prev;

      // Convert "HH:MM" string format into minutes
      const toMins = (t: string): number => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
      };

      // Find all blocks that are part of the contiguous linear group (touching or overlapping)
      const groupIds: string[] = [id];
      let added = true;
      while (added) {
        added = false;
        for (const item of prev) {
          if (groupIds.includes(item.id)) continue;

          const itemStart = toMins(item.startTime);
          const itemEnd = toMins(item.endTime);

          const isConnected = groupIds.some(gId => {
            const gBlock = prev.find(b => b.id === gId);
            if (!gBlock) return false;
            const gStart = toMins(gBlock.startTime);
            const gEnd = toMins(gBlock.endTime);
            // Touch or overlap condition
            return (itemEnd >= gStart && gEnd >= itemStart);
          });

          if (isConnected) {
            groupIds.push(item.id);
            added = true;
          }
        }
      }

      return prev.filter(b => !groupIds.includes(b.id));
    });
    setCalibrationRequired(true);
  };

  const handleAddInterruption = (name: string, startTime: string, duration: number) => {
    const newBlock: Interruption = {
      id: `inter-${Date.now()}`,
      name,
      startTime,
      duration
    };
    setInterruptions(prev => [...prev, newBlock]);
    setCalibrationRequired(true);
  };

  const handleRemoveInterruption = (id: string) => {
    setInterruptions(prev => prev.filter(item => item.id !== id));
    setCalibrationRequired(true);
  };

  const handleScheduleTask = (taskId: string, startTime: string) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    const [h, m] = startTime.split(':').map(Number);
    const startMins = h * 60 + m;
    const endMins = startMins + task.duration;
    
    const endH = Math.floor(endMins / 60) % 24;
    const endM = endMins % 60;
    const endTime = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;

    const newItem: ScheduleItem = {
      taskId: task.id,
      taskTitle: task.title,
      startTime,
      endTime,
      isDeepWork: task.isDeepWork,
      priority: task.priority
    };

    setScheduledItems(prev => {
      const filtered = prev.filter(s => s.taskId !== taskId);
      return [...filtered, newItem];
    });

    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return { ...t, assignedTime: startTime };
      }
      return t;
    }));

    setCalibrationRequired(true);
  };

  const handleUnscheduleTask = (taskId: string) => {
    setScheduledItems(prev => prev.filter(s => s.taskId !== taskId));
    setTasks(prev => prev.map(t => {
      if (t.id === taskId) {
        return { ...t, assignedTime: null };
      }
      return t;
    }));
    setCalibrationRequired(true);
  };

  // Connect to local Gemini instance directly (No server required)
  const handleOptimizeSchedule = async () => {
    if (!userApiKey) {
      alert("Please enter your Gemini API Key in the 'Key Config' (CPU icon) to optimize your schedule.");
      setShowKeySettings(true);
      return;
    }

    setIsOptimizing(true);
    setLoadingStep("Connecting to Gemini AI Engine...");

    try {
      const { GoogleGenAI } = await import("@google/genai");
      const genAI = new GoogleGenAI(userApiKey);
      const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        generationConfig: { responseMimeType: "application/json" }
      });

      const systemPrompt = `You are an expert personal productivity assistant... (Scheduling Rules apply)`;
      const userPrompt = `Optimize this: Current Time: ${currentTime}, Tasks: ${JSON.stringify(tasks)}, Routines: ${JSON.stringify(routineBlocks)}`;

      const result = await model.generateContent([systemPrompt, userPrompt]);
      const data = JSON.parse(result.response.text());

      setScheduledItems(data.scheduledItems || []);
      setUnresolvedTasks(data.unresolvedTasks || []);
      setProductivityScore(data.productivityScore || 80);
      setExplanation(data.explanation || "Optimization complete.");
      
      setTasks(prev => prev.map(t => {
        const match = (data.scheduledItems || []).find((item: any) => item.taskId === t.id);
        return { ...t, assignedTime: match ? match.startTime : null };
      }));

      setCalibrationRequired(false);
      setActiveTab('schedule');
    } catch (err: any) {
      console.error(err);
      alert("Gemini Local Error: " + (err.message || "Failed to optimize. Check your API key."));
    } finally {
      setIsOptimizing(false);
      setLoadingStep("");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-white">
      {showKeySettings && (
        <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-3.5 shrink-0 animate-fadeIn text-slate-800 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className={`h-4 w-4 ${userApiKey ? 'text-indigo-600' : 'text-slate-400'}`} />
              <h4 className="text-[10px] uppercase font-mono tracking-widest font-extrabold text-slate-700">Custom Gemini API Key</h4>
            </div>
            {userApiKey ? (
              <span className="inline-flex items-center bg-emerald-50 text-emerald-700 border border-emerald-150 rounded-xs px-1.5 py-0.5 text-[8.5px] font-mono uppercase font-bold">
                ● Connected
              </span>
            ) : (
              <span className="inline-flex items-center bg-amber-50 text-amber-700 border border-amber-150 rounded-xs px-1.5 py-0.5 text-[8.5px] font-mono uppercase font-bold">
                ● Shared Key Active
              </span>
            )}
          </div>
          <p className="text-[10.5px]/relaxed text-slate-500 font-semibold font-sans">
            To run the planner on your own API quota, enter your personal <strong className="text-slate-700">Gemini API Key</strong> here. It is stored exclusively on your device within <code className="bg-slate-100 rounded px-1">localStorage</code>.
          </p>
          <div className="flex gap-2">
            <input
              type="password"
              value={userApiKey}
              onChange={(e) => setUserApiKey(e.target.value)}
              placeholder="Paste AI Studio Key (AIzaSy...)"
              className="flex-1 bg-white border border-slate-250 rounded px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 font-mono focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            {userApiKey && (
              <button
                type="button"
                onClick={() => {
                  setUserApiKey("");
                  setShowKeySettings(false);
                }}
                className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 text-[10px] font-black uppercase tracking-widest border border-rose-200 rounded-sm cursor-pointer active:scale-98 transition-transform"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowKeySettings(false)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-750 text-white text-[10px] font-black uppercase tracking-widest rounded-sm cursor-pointer active:scale-98 transition-transform shadow-xs shadow-indigo-100"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Main Screen Content Frame */}
      <div className="flex-1 overflow-y-auto flex flex-col relative bg-white">
        {isOptimizing ? (
          /* Staggered optimization loading frame */
          <div className="absolute inset-0 bg-white/95 z-50 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <div className="relative flex items-center justify-center">
              <div className="w-16 h-16 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <Sparkles className="h-6 w-6 text-indigo-600 absolute animate-pulse" />
            </div>
            
            <div className="space-y-1.5 max-w-xs">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest font-mono">Gemini Thinking</h3>
              <p className="text-xs text-slate-500 italic font-semibold">"{loadingStep}"</p>
            </div>
          </div>
        ) : null}

        {/* Dynamic Inner Tab View Router */}
        {activeTab === 'schedule' && (
          <ActiveTask
            tasks={tasks}
            currentTime={currentTime}
            onToggleTaskStatus={handleToggleTaskStatus}
            onShuffleTask={handleShuffleTask}
            unresolvedTasks={unresolvedTasks}
            score={productivityScore}
            explanation={explanation}
            hasApiKey={hasApiKey}
            onTriggerOptimize={handleOptimizeSchedule}
            isOptimizing={isOptimizing}
            routineBlocks={routineBlocks}
            interruptions={interruptions}
          />
        )}

        {activeTab === 'tasks' && (
          <TaskListManager
            tasks={tasks}
            onAddTask={handleAddTask}
            onDeleteTask={handleDeleteTask}
            onToggleStatus={handleToggleTaskStatus}
            userApiKey={userApiKey}
            onUpdateAllTasks={setTasks}
            onUpdateScore={setProductivityScore}
            onUpdateExplanation={setExplanation}
            routineBlocks={routineBlocks}
            currentTime={currentTime}
          />
        )}

        {activeTab === 'routine' && (
          <RoutineConfig
            routineBlocks={routineBlocks}
            onUpdateRoutineTime={handleUpdateRoutineTime}
            onUpdateRoutineBlock={handleUpdateRoutineBlock}
            onAddRoutine={handleAddRoutine}
            onRemoveRoutine={handleRemoveRoutine}
            interruptions={interruptions}
            onAddInterruption={handleAddInterruption}
            onRemoveInterruption={handleRemoveInterruption}
            tasks={tasks}
            scheduledItems={scheduledItems}
            onToggleTaskStatus={handleToggleTaskStatus}
            onScheduleTask={handleScheduleTask}
            onUnscheduleTask={handleUnscheduleTask}
            onTriggerOptimize={handleOptimizeSchedule}
            isOptimizing={isOptimizing}
          />
        )}
      </div>

      {/* Dynamic 3-Tab Bottom Navigation Bar - High-Fidelity Custom Aesthetics */}
      <div className="bg-white border-t border-slate-200 h-[84px] pb-5 pt-2.5 px-6 flex items-center justify-between shrink-0 z-40 select-none relative shadow-md">
        {/* Left Option: Brain Dump */}
        <button
          type="button"
          onClick={() => setActiveTab('tasks')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 cursor-pointer select-none transition-colors ${
            activeTab === 'tasks' ? 'text-indigo-600 font-extrabold' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <CheckSquare className="h-5 w-5 shrink-0" />
          <span className="text-[10px] tracking-wide font-bold uppercase text-center">Brain Dump</span>
        </button>

        {/* Protruding Center: Active Focus surrounded by a circle frame */}
        <div className="flex-1 flex flex-col items-center justify-center h-full relative select-none z-50">
          <div className="absolute -top-5 flex flex-col items-center">
            <button
              type="button"
              onClick={() => setActiveTab('schedule')}
              className={`h-14 w-14 rounded-full flex items-center justify-center cursor-pointer transition-transform duration-200 active:scale-95 shadow-md ${
                activeTab === 'schedule'
                  ? 'bg-indigo-600 text-white shadow-indigo-200 scale-105 border-4 border-white'
                  : 'bg-white text-slate-400 hover:text-slate-700 border border-slate-200 hover:bg-slate-50'
              }`}
              title="Active Focus Target"
            >
              <Flame className="h-6 w-6 shrink-0" />
            </button>
            <span className={`block text-center text-[9.5px] uppercase font-bold tracking-wider mt-1 select-none ${
              activeTab === 'schedule' ? 'text-indigo-600 font-black' : 'text-slate-400 font-bold'
            }`}>
              Active Focus
            </span>
          </div>
        </div>

        {/* Right Option: Day at a Glance */}
        <button
          type="button"
          onClick={() => setActiveTab('routine')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 cursor-pointer select-none transition-colors ${
            activeTab === 'routine' ? 'text-indigo-600 font-extrabold' : 'text-slate-400 hover:text-slate-700'
          }`}
        >
          <Grid className="h-5 w-5 shrink-0" />
          <span className="text-[10px] tracking-wide font-bold uppercase text-center">Day at a Glance</span>
        </button>
      </div>
    </div>
  );
}
