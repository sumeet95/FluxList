/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Task, RoutineBlock, Interruption } from '../types';
import { 
  CheckCircle2, 
  AlertTriangle, 
  ArrowRight, 
  Trophy, 
  Clock, 
  Sparkles, 
  Shuffle, 
  FileText,
  Brain,
  Zap,
  Award,
  Info,
  Lightbulb,
  Lock
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface ActiveTaskProps {
  tasks: Task[];
  currentTime: string;
  onToggleTaskStatus: (taskId: string) => void;
  onShuffleTask: (taskId: string) => void;
  unresolvedTasks: { taskId: string; title: string; reason: string }[];
  score?: number;
  explanation?: string;
  hasApiKey?: boolean;
  onTriggerOptimize?: () => void;
  isOptimizing?: boolean;
  routineBlocks?: RoutineBlock[];
  interruptions?: Interruption[];
}

export default function ActiveTask({
  tasks = [],
  currentTime,
  onToggleTaskStatus,
  onShuffleTask,
  unresolvedTasks = [],
  score = 100,
  explanation = "",
  hasApiKey = true,
  onTriggerOptimize,
  isOptimizing = false,
  routineBlocks = [],
  interruptions = []
}: ActiveTaskProps) {
  // Navigation internal tab: 'target' (Focus Target) or 'insights' (AI Advisor & optimizer)
  const [activeSubTab, setActiveSubTab] = useState<'target' | 'insights'>('target');

  // Filter for pending tasks
  const pendingTasks = tasks.filter(t => t.status === 'pending');

  // Sort them:
  // 1. Priority: high > medium > low
  // 2. shuffledAt: unshuffled or older shuffled tasks come first
  // 3. Assigned time (chronological)
  // 4. ID (fallback)
  const sortedPending = [...pendingTasks].sort((a, b) => {
    const priorityWeight = { high: 3, medium: 2, low: 1 };
    const weightA = priorityWeight[a.priority] || 0;
    const weightB = priorityWeight[b.priority] || 0;

    if (weightB !== weightA) {
      return weightB - weightA; // Higher weight first
    }

    const shuffleA = a.shuffledAt || 0;
    const shuffleB = b.shuffledAt || 0;
    if (shuffleA !== shuffleB) {
      return shuffleA - shuffleB; // Smaller timestamp (or 0 / unshuffled) first
    }

    if (a.assignedTime && b.assignedTime) {
      return a.assignedTime.localeCompare(b.assignedTime);
    }
    if (a.assignedTime) return -1;
    if (b.assignedTime) return 1;

    return a.id.localeCompare(b.id);
  });

  // Current active task
  const activeTask = sortedPending[0];
  const nextTasksQueue = sortedPending.slice(1, 3); // next 2 tasks in queue

  // Convert assigned time to readable 12h clock
  const formatTime12h = (timeStr: string | null | undefined) => {
    if (!timeStr) return "Flexible Window";
    const [h, m] = timeStr.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const dispH = h % 12 === 0 ? 12 : h % 12;
    return `${dispH}:${String(m).padStart(2, '0')} ${ampm}`;
  };

  // Check off active task
  const handleCompleteActiveTask = () => {
    if (activeTask) {
      // 1. Core Center Burst
      confetti({
        particleCount: 140,
        spread: 110,
        origin: { x: 0.5, y: 0.5 },
        colors: ['#4f46e5', '#3ecf8e', '#f59e0b', '#ec4899', '#ef4444'],
        scalar: 1.3,
        zIndex: 100
      });

      // 2. Left Side Cannon
      confetti({
        particleCount: 100,
        spread: 80,
        angle: 45,
        origin: { x: 0, y: 0.85 },
        colors: ['#6366f1', '#818cf8', '#34d399', '#fbbf24'],
        scalar: 1.1,
        zIndex: 100
      });

      // 3. Right Side Cannon
      confetti({
        particleCount: 100,
        spread: 80,
        angle: 135,
        origin: { x: 1, y: 0.85 },
        colors: ['#6366f1', '#818cf8', '#34d399', '#fbbf24'],
        scalar: 1.1,
        zIndex: 100
      });

      setTimeout(() => {
        onToggleTaskStatus(activeTask.id);
      }, 750);
    }
  };

  // Shuffle / demote active task priority
  const handleShuffleActiveTask = () => {
    if (activeTask) {
      onShuffleTask(activeTask.id);
    }
  };

  // Get color gradient & text label based on productivity score
  const getScoreData = (val: number) => {
    if (val >= 85) return { color: "text-indigo-600 border-indigo-200 bg-indigo-50/40", track: "stroke-indigo-600", label: "Peak Efficiency", desc: "Your schedule is fully optimized with contiguous deep-work blocks and healthy buffers." };
    if (val >= 65) return { color: "text-amber-600 border-amber-200 bg-amber-50/40", track: "stroke-amber-500", label: "Balanced Progress", desc: "Good focus groupings, but task transitions could cause light fatigue today." };
    return { color: "text-rose-600 border-rose-200 bg-rose-50/40", track: "stroke-rose-500", label: "High Cognitive Friction", desc: "Frequent switching or missing blocks detected. Re-align schedule to maximize capacity." };
  };

  const scoreData = getScoreData(score);

  // Generate task based intelligence stats
  const completedTasksList = tasks.filter(t => t.status === 'completed');
  const totalPendingMinutes = pendingTasks.reduce((acc, t) => acc + t.duration, 0);
  const highPriorityTasks = pendingTasks.filter(t => t.priority === 'high');
  const deepWorkTasks = pendingTasks.filter(t => t.isDeepWork);

  // Calculate routine boundaries
  const workBlocks = routineBlocks.filter(r => r.type === 'work');
  const totalWorkMinutesCalculated = workBlocks.reduce((acc, b) => {
    const [sH, sM] = b.startTime.split(':').map(Number);
    const [eH, eM] = b.endTime.split(':').map(Number);
    const diff = (eH * 60 + eM) - (sH * 60 + sM);
    return acc + (diff > 0 ? diff : 0);
  }, 0);

  // Formulate dynamic local schedule insights based on the user's active task list
  const getTaskBasedInsights = () => {
    const insights: { type: 'warning' | 'tip' | 'success'; title: string; message: string; icon: React.ReactNode }[] = [];

    if (tasks.length === 0) {
      insights.push({
        type: 'tip',
        title: 'Empty Brain Dump',
        message: 'No tasks registered in your dump list yet. Go to the Brain Dump tab to add items so Gemini can analyze your day!',
        icon: <Info className="h-4 w-4 text-slate-500" />
      });
      return insights;
    }

    if (totalPendingMinutes > totalWorkMinutesCalculated && totalWorkMinutesCalculated > 0) {
      insights.push({
        type: 'warning',
        title: 'Workload Capacity Overload',
        message: `Your tasks demand ${Math.round(totalPendingMinutes / 60 * 10) / 10} hours of focus, but your locked routine work blocks only provide ${Math.round(totalWorkMinutesCalculated / 60 * 10) / 10} hours. Use the optimizer below to help locate extra focus slots.`,
        icon: <AlertTriangle className="h-4 w-4 text-amber-500" />
      });
    }

    if (deepWorkTasks.length >= 3) {
      insights.push({
        type: 'tip',
        title: 'High Cognitive Fatigue Risks',
        message: `You have ${deepWorkTasks.length} deep focus sessions today. Try to buffer these with appropriate meal or personal routine breaks to maintain clarity.`,
        icon: <Brain className="h-4 w-4 text-indigo-500" />
      });
    }

    if (highPriorityTasks.length >= 3) {
      insights.push({
        type: 'warning',
        title: 'High Context-Switching Costs',
        message: `With ${highPriorityTasks.length} high-priority tasks in progress, try to batch related activities together to keep your attention steady.`,
        icon: <Zap className="h-4 w-4 text-amber-600" />
      });
    }

    if (completedTasksList.length > 0) {
      insights.push({
        type: 'success',
        title: 'Momentum Secured',
        message: `Fantastic progress! You completed ${completedTasksList.length} task${completedTasksList.length > 1 ? 's' : ''} today. Re-align to lock in slots for your remaining backlog.`,
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      });
    }

    if (insights.length === 0 && pendingTasks.length > 0) {
      insights.push({
        type: 'success',
        title: 'Balanced Schedule Distribution',
        message: 'Your current list of priorities matches your daily routine bounds perfectly.',
        icon: <Award className="h-4 w-4 text-emerald-500" />
      });
    }

    return insights;
  };

  const dynamicInsights = getTaskBasedInsights();

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50/20" id="active-task-container">
      {/* Top compact session header */}
      <div className="px-4 py-3 border-b border-slate-100 bg-white shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Clock className="h-4 w-4 text-indigo-600 animate-pulse" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700 font-mono">Focus Target</h2>
        </div>
        {onTriggerOptimize && pendingTasks.length > 0 && (
          <button
            type="button"
            onClick={onTriggerOptimize}
            disabled={isOptimizing}
            className={`py-1.5 px-3 rounded-sm font-bold text-[9px] uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer border ${
              isOptimizing
                ? 'bg-slate-150 text-slate-400 border-slate-205 cursor-not-allowed animate-pulse'
                : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-705 border-indigo-200 hover:border-indigo-300 shadow-3xs active:scale-95'
            }`}
            title="Calibrate schedule blocks with Gemini"
          >
            <Sparkles className={`h-3 w-3 ${isOptimizing ? 'animate-spin' : 'text-indigo-550'}`} />
            <span>{isOptimizing ? "Optimizing..." : "Optimize Day"}</span>
          </button>
        )}
      </div>

      {/* Main active Focus Target view */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="p-3 space-y-3 flex flex-col h-full">
          {!activeTask ? (
            /* Trophy page inline if completed */
            <div className="flex-1 flex flex-col p-6 space-y-6 items-center justify-center text-center">
              <div className="bg-gradient-to-tr from-indigo-50 to-indigo-100 p-6 rounded-full border border-indigo-250 text-indigo-650 animate-bounce shadow-sm">
                <Trophy className="h-10 w-10 text-indigo-605" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight font-mono">Slate Fully Processed!</h2>
                <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                  All tasks are completed! There are no remaining items left to focus on in your active plan.
                </p>
              </div>

              {completedTasksList.length > 0 && (
                <div className="bg-indigo-50/50 border border-indigo-100 py-2 px-4 rounded-sm">
                  <span className="text-2xs font-extrabold font-mono text-indigo-700 tracking-wider">
                    🏆 {completedTasksList.length} TASK{completedTasksList.length > 1 ? 'S' : ''} SWEPT AND COMPLETED TODAY
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* Standard Active Focus Layout */
            <>
              {/* Main Paramount Focus Card */}
              <div className="flex-1 bg-white border-2 border-indigo-600 rounded-sm p-4 shadow-sm z-10 relative overflow-hidden flex flex-col justify-between min-h-[300px]">
                <div className="absolute right-0 top-0 h-28 w-28 opacity-5 bg-indigo-600 rounded-full blur-xl pointer-events-none"></div>

                <div className="space-y-3.5 flex-1 flex flex-col">
                  <div className="flex items-center justify-between shrink-0">
                    <span className="inline-flex items-center gap-1 text-[8.5px] font-black tracking-widest bg-indigo-50 text-indigo-705 border border-indigo-100 px-1.5 py-0.5 rounded-sm font-mono uppercase">
                      ★ Active Focus Target
                    </span>
                    <span className={`text-[8px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 border rounded-sm font-mono ${
                      activeTask.priority === 'high' 
                        ? 'bg-rose-50 text-rose-700 border-rose-200' 
                        : activeTask.priority === 'medium'
                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                        : 'bg-slate-50 text-slate-605 border-slate-205'
                    }`}>
                      {activeTask.priority} PRIORITY
                    </span>
                  </div>

                  <div className="space-y-1.5 shrink-0">
                    <h1 className="text-base md:text-lg font-black text-slate-900 leading-snug tracking-tight">
                      {activeTask.title}
                    </h1>
                  </div>

                  {/* Description Notes Box */}
                  <div className="bg-slate-50/80 border border-slate-200/70 rounded-sm p-3.5 flex-1 flex flex-col space-y-2 min-h-[110px]">
                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-500 font-mono flex items-center gap-1.5 shrink-0 border-b border-slate-200/40 pb-1.5">
                      <FileText className="h-3.5 w-3.5 text-slate-405" />
                      <span>Task Description</span>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-1">
                      <p className="text-xs text-slate-700 leading-relaxed font-semibold font-sans">
                        {activeTask.notes ? activeTask.notes : (
                          <span className="text-slate-400 font-normal italic">
                            No custom description provided for this task. You can add extra details and context under the Brain Dump tab to guide your focused workflow.
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* Properties Info */}
                  <div className="shrink-0 space-y-2 py-0.5">
                    <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                      <div className="bg-slate-50 border border-slate-200 rounded-sm p-2 px-3 flex flex-col justify-between">
                        <span className="text-[7.5px] font-black text-slate-400 uppercase tracking-widest">Span</span>
                        <span className="font-extrabold text-slate-800 text-xs mt-1">{activeTask.duration} mins</span>
                      </div>

                      <div className="bg-slate-50 border border-slate-200 rounded-sm p-2 px-3 flex flex-col justify-between">
                        <span className="text-[7.5px] font-black text-indigo-400 uppercase tracking-widest">Optimal</span>
                        <span className="font-extrabold text-slate-800 text-xs capitalize mt-1 truncate">{activeTask.preferredWindow || 'Any Time'}</span>
                      </div>
                    </div>

                    <div className="bg-indigo-50/70 border border-indigo-150 p-2 px-3 rounded-sm flex items-center justify-between font-mono">
                      <div className="flex items-center gap-2">
                        <div className="bg-indigo-100/80 p-1 text-indigo-750 rounded-sm">
                          <Clock className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <span className="text-indigo-600/70 block font-black text-[7.5px] uppercase tracking-wider">Scheduled Frame</span>
                          <span className="font-extrabold text-indigo-900 text-xs">
                            {formatTime12h(activeTask.assignedTime)}
                          </span>
                        </div>
                      </div>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs text-[7px] font-black bg-indigo-150 text-indigo-700 border border-indigo-200 uppercase">
                        Active
                      </span>
                    </div>
                  </div>
                </div>

                {/* Complete & Shuffle */}
                <div className="grid grid-cols-2 gap-2 mt-3 shrink-0">
                  <button
                    type="button"
                    onClick={handleShuffleActiveTask}
                    className="py-2 bg-slate-55 hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-250 text-[10px] font-black uppercase tracking-widest rounded-sm transition-transform active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 shadow-3xs"
                  >
                    <Shuffle className="h-3.5 w-3.5 text-slate-500" />
                    <span>Shuffle Task</span>
                  </button>
                  
                  <button
                    type="button"
                    onClick={handleCompleteActiveTask}
                    className="py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-sm transition-transform active:scale-98 cursor-pointer flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Complete</span>
                  </button>
                </div>
              </div>

              {/* Direct Conflicts Indicator */}
              {unresolvedTasks.length > 0 && (
                <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-sm space-y-1 z-10 shrink-0">
                  <div className="flex items-center gap-1.5 text-rose-750 font-extrabold text-[9px] uppercase tracking-wider font-mono">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                    <span>Active Conflicts Detected ({unresolvedTasks.length})</span>
                  </div>
                  <div className="space-y-1">
                    {unresolvedTasks.slice(0, 1).map((ut, idx) => (
                      <div key={idx} className="bg-white border border-rose-100 p-1.5 px-2 rounded-sm flex items-center justify-between text-[10px] shadow-3xs">
                        <span className="font-bold text-slate-800 truncate max-w-[210px]">{ut.title}</span>
                        <span className="text-rose-600 text-[8px] font-black font-mono uppercase bg-rose-50 px-1 border border-rose-100">{ut.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Remaining Tasks preview info box */}
              {pendingTasks.length > 1 && (
                <div className="z-10 bg-slate-50 border border-slate-200 p-2.5 px-3 rounded-sm flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse shrink-0" />
                    <div>
                      <h4 className="text-[9px] font-black uppercase tracking-widest text-slate-500 font-mono">Remaining Tasks</h4>
                      <p className="text-[10px] text-slate-400 font-semibold">In your active session list</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 bg-indigo-50 border border-indigo-150 px-2 py-0.5 rounded-sm">
                    <span className="text-2xs font-bold font-mono text-indigo-700">
                      {pendingTasks.length - 1}
                    </span>
                    <span className="text-[8px] font-extrabold uppercase tracking-wider text-indigo-600 font-mono">
                      Left
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
