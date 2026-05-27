/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Task, RoutineBlock, Interruption, ScheduleItem } from '../types';
import { Calendar, CheckCircle2, Circle, Clock, Flame, ShieldAlert, Sparkles, AlertTriangle } from 'lucide-react';

interface ScheduleTimelineProps {
  tasks: Task[];
  routineBlocks: RoutineBlock[];
  interruptions: Interruption[];
  scheduledItems: ScheduleItem[];
  currentTime: string; // HH:MM
  onToggleTaskStatus: (taskId: string) => void;
  onRemoveInterruption: (id: string) => void;
  unresolvedTasks: { taskId: string; title: string; reason: string }[];
}

export default function ScheduleTimeline({
  tasks,
  routineBlocks,
  interruptions,
  scheduledItems,
  currentTime,
  onToggleTaskStatus,
  onRemoveInterruption,
  unresolvedTasks
}: ScheduleTimelineProps) {

  // Parse time to minutes for chronological comparison
  const timeToMinutes = (t: string): number => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const currentMinutes = timeToMinutes(currentTime);

  // Combine items to draw in sequence
  // We want to slice the 24 hours into blocks
  const timelineEvents: {
    type: 'routine' | 'task' | 'interruption';
    id: string;
    title: string;
    startTime: string;
    endTime: string;
    isLocked?: boolean;
    isDeepWork?: boolean;
    priority?: 'high' | 'medium' | 'low';
    status?: 'pending' | 'completed' | 'missed';
    category?: string;
    minutesStart: number;
    minutesEnd: number;
  }[] = [];

  // Add routine blocks (grouped as one large block if contiguous/overlapping)
  const mergedTimelineRoutines: RoutineBlock[] = [];
  const visitedTimeline = new Set<string>();
  const sortedRoutines = [...routineBlocks].sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));

  for (const block of sortedRoutines) {
    if (visitedTimeline.has(block.id)) continue;

    const currentGroup: RoutineBlock[] = [block];
    visitedTimeline.add(block.id);

    let added = true;
    while (added) {
      added = false;
      for (const item of sortedRoutines) {
        if (visitedTimeline.has(item.id)) continue;

        const itemStart = timeToMinutes(item.startTime);
        const itemEnd = timeToMinutes(item.endTime);

        const isConnected = currentGroup.some(gBlock => {
          const gStart = timeToMinutes(gBlock.startTime);
          const gEnd = timeToMinutes(gBlock.endTime);
          return (itemEnd >= gStart && gEnd >= itemStart);
        });

        if (isConnected) {
          currentGroup.push(item);
          visitedTimeline.add(item.id);
          added = true;
        }
      }
    }

    currentGroup.sort((a, b) => timeToMinutes(a.startTime) - timeToMinutes(b.startTime));
    const firstObj = currentGroup[0];
    const lastObj = currentGroup[currentGroup.length - 1];

    mergedTimelineRoutines.push({
      id: firstObj.id,
      name: firstObj.name,
      startTime: firstObj.startTime,
      endTime: lastObj.endTime,
      type: firstObj.type,
      isLocked: firstObj.isLocked,
      isRecurring: currentGroup.some(b => b.isRecurring)
    });
  }

  mergedTimelineRoutines.forEach(block => {
    timelineEvents.push({
      type: 'routine',
      id: block.id,
      title: block.name,
      startTime: block.startTime,
      endTime: block.endTime,
      isLocked: block.isLocked,
      category: block.type,
      minutesStart: timeToMinutes(block.startTime),
      minutesEnd: timeToMinutes(block.endTime)
    });
  });

  // Add interruptions
  interruptions.forEach(item => {
    const minsStart = timeToMinutes(item.startTime);
    const minsEnd = minsStart + item.duration;
    const endH = Math.floor(minsEnd / 60) % 24;
    const endM = minsEnd % 60;
    const endTimeStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
    
    timelineEvents.push({
      type: 'interruption',
      id: item.id,
      title: item.name,
      startTime: item.startTime,
      endTime: endTimeStr,
      minutesStart: minsStart,
      minutesEnd: minsEnd
    });
  });

  // Add scheduled tasks
  scheduledItems.forEach(item => {
    const origTask = tasks.find(t => t.id === item.taskId);
    timelineEvents.push({
      type: 'task',
      id: item.taskId,
      title: item.taskTitle,
      startTime: item.startTime,
      endTime: item.endTime,
      isDeepWork: item.isDeepWork,
      priority: item.priority,
      status: origTask?.status || 'pending',
      minutesStart: timeToMinutes(item.startTime),
      minutesEnd: timeToMinutes(item.endTime)
    });
  });

  // Sort chronologically
  timelineEvents.sort((a, b) => a.minutesStart - b.minutesStart);

  // Format dynamic display string
  const formatTimeRange = (start: string, end: string) => {
    const convert = (str: string) => {
      const [h, m] = str.split(':').map(Number);
      const ampm = h >= 12 ? 'PM' : 'AM';
      const dispH = h % 12 === 0 ? 12 : h % 12;
      return `${dispH}:${String(m).padStart(2, '0')} ${ampm}`;
    };
    return `${convert(start)} - ${convert(end)}`;
  };

  return (
    <div className="flex-1 flex flex-col p-4 space-y-4 geometric-grid overflow-y-auto">
      
      {/* Simulation Clock Display */}
      <div className="bg-white border border-slate-200 p-3.5 rounded-sm shadow-xs flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <div className="bg-indigo-50 p-2 rounded-sm border border-indigo-100 text-indigo-600">
            <Clock className="h-5 w-5" id="sim-clock-icon" />
          </div>
          <div>
            <div className="text-[10px] text-slate-400 uppercase tracking-widest font-extrabold font-mono">Current Simulation Time</div>
            <div className="text-lg font-bold text-slate-900 font-mono tracking-tight">{currentTime}</div>
          </div>
        </div>
        <div className="text-right">
          <span className="inline-flex items-center px-2 py-0.5 rounded-sm text-2xs font-bold bg-indigo-50 text-indigo-600 border border-indigo-100 font-mono tracking-wider">
            • LIVE TIMELINE
          </span>
        </div>
      </div>

      {unresolvedTasks.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-sm space-y-2 z-10 shadow-xs">
          <div className="flex items-center gap-2 text-rose-700 font-semibold text-xs uppercase tracking-wider font-mono">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-500" />
            UNRESOLVED / OVERFLOW TASKS ({unresolvedTasks.length})
          </div>
          <div className="space-y-1.5">
            {unresolvedTasks.map((ut) => (
              <div key={ut.taskId} className="bg-white border border-rose-100 p-2 rounded-sm flex items-center justify-between text-xs shadow-3xs">
                <span className="font-semibold text-slate-800">{ut.title}</span>
                <span className="text-rose-600 text-2xs font-bold font-mono uppercase bg-rose-50 px-1 border border-rose-100">{ut.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vertical timeline items with Geometric line styling */}
      <div className="space-y-4 relative before:absolute before:left-4.5 before:top-4 before:bottom-4 before:w-0.5 before:bg-slate-200 flex-1">
        
        {timelineEvents.map((event, index) => {
          const isPast = event.minutesEnd <= currentMinutes;
          const isCurrent = currentMinutes >= event.minutesStart && currentMinutes < event.minutesEnd;
          
          let cardStyle = "";
          let badgeColor = "";
          let icon = <Clock className="h-4 w-4" />;

          if (event.type === 'routine') {
            if (event.category === 'sleep') {
              cardStyle = "bg-indigo-50/50 border-slate-200 text-indigo-900 border-l-[5px] border-l-indigo-400";
              badgeColor = "bg-indigo-100 text-indigo-700 border-indigo-200/50";
            } else if (event.category === 'meal') {
              cardStyle = "bg-amber-50/40 border-slate-200 text-slate-800 border-l-[5px] border-l-amber-400";
              badgeColor = "bg-amber-100 text-amber-800 border-amber-200/50";
            } else if (event.category === 'break') {
              cardStyle = "bg-cyan-50/40 border-slate-200 text-slate-800 border-l-[5px] border-l-cyan-400";
              badgeColor = "bg-cyan-100 text-cyan-800 border-cyan-200/30";
            } else {
              // work/flex standard blocks
              cardStyle = "bg-slate-50 border-slate-200 text-slate-800 border-l-[5px] border-l-slate-400 border-dashed";
              badgeColor = "bg-slate-100 text-slate-500 border-slate-200";
            }
          } else if (event.type === 'interruption') {
            cardStyle = "bg-rose-50 border-rose-200 text-rose-900 border-l-[5px] border-l-rose-500";
            badgeColor = "bg-rose-100 text-rose-700 border-rose-200";
            icon = <ShieldAlert className="h-4 w-4 text-rose-500" />;
          } else {
            // Task type
            if (event.status === 'completed') {
              cardStyle = "bg-slate-50 border-slate-200 text-slate-400 opacity-60 line-through border-l-[5px] border-l-emerald-400";
              badgeColor = "bg-slate-100 text-slate-400 border-slate-200";
              icon = <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />;
            } else {
              // AI optimized / highly high-priority block gets the main theme styling
              cardStyle = event.priority === 'high' 
                ? "bg-white border-2 border-indigo-600 text-slate-900 shadow-md ring-1 ring-indigo-100 ai-optimized border-l-[5px]" 
                : event.priority === 'medium'
                ? "bg-white border-slate-200 text-slate-800 shadow-sm border-l-[5px] border-l-amber-500"
                : "bg-white border-slate-200 text-slate-800 shadow-xs border-l-[5px] border-l-blue-400";
              
              badgeColor = event.priority === 'high' 
                ? "bg-indigo-100 text-indigo-700 border-indigo-200" 
                : event.priority === 'medium'
                ? "bg-amber-100 text-amber-800 border-amber-200"
                : "bg-blue-100 text-blue-700 border-blue-200";
              
              icon = <Circle className="h-4 w-4 text-slate-400 hover:text-indigo-600 shrink-0 cursor-pointer transition-colors" />;
            }
          }

          return (
            <div 
              key={`${event.type}-${event.id}-${index}`} 
              className={`relative flex items-start gap-4 transition-all duration-300 ${
                isPast ? 'opacity-60' : ''
              } ${isCurrent ? 'scale-[1.01] ring-2 ring-indigo-600 ring-offset-2 rounded-sm bg-indigo-50/20 p-1' : ''}`}
            >
              {/* Timeline bubble connector - geometric crisp circle */}
              <div className="relative z-15 flex items-center justify-center w-9 h-9 mt-1 rounded-full bg-white border-2 border-slate-300 shadow-sm shrink-0">
                {event.type === 'task' ? (
                  <button onClick={() => onToggleTaskStatus(event.id)} className="transition-transform active:scale-90">
                    {icon}
                  </button>
                ) : (
                  <div className="text-slate-400">{icon}</div>
                )}
              </div>

              {/* Event details card with 4px geometric left-border */}
              <div className={`flex-1 p-3.5 rounded-sm border ${cardStyle} task-block relative overflow-hidden`}>
                {event.type === 'task' && event.priority === 'high' && event.status !== 'completed' && (
                  /* Glowing corner angle from design demo */
                  <div className="absolute right-0 top-0 h-full w-12 opacity-5 bg-indigo-600 transform rotate-12 translate-x-6"></div>
                )}

                <div className="flex items-start justify-between gap-1 z-10 relative">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-sm font-bold tracking-tight text-slate-900 ${event.status === 'completed' ? 'line-through text-slate-400 font-medium' : ''}`}>
                        {event.title}
                      </span>
                      {event.isDeepWork && (
                        <span className="flex items-center gap-0.5 text-[8px] font-black bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.2 rounded-sm font-mono tracking-widest uppercase">
                          • FOCUS
                        </span>
                      )}
                    </div>
                    
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 font-bold font-mono tracking-wide mt-1 bg-slate-100 px-1 py-0.5 border border-slate-200/60 rounded-xs">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {formatTimeRange(event.startTime, event.endTime)}
                    </span>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className={`text-[8.5px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 border rounded-sm font-mono ${badgeColor}`}>
                      {event.type === 'routine' ? event.category : event.type === 'interruption' ? 'blocker' : `${event.priority}`}
                    </span>
                    
                    {event.type === 'interruption' && (
                      <button 
                        onClick={() => onRemoveInterruption(event.id)}
                        className="text-[9px] text-rose-600 hover:text-rose-800 font-bold underline font-mono cursor-pointer"
                      >
                        REMOVE BLOCKER
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {timelineEvents.length === 0 && (
          <div className="text-center py-12 px-4 border border-dashed border-slate-300 rounded-sm bg-slate-50/55">
            <Calendar className="h-8 w-8 text-slate-400 mx-auto mb-2" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono">Empty Schedule</h3>
            <p className="text-xs text-slate-500 mt-1">Add tasks and trigger Gemini Calibration to construct your productivity track.</p>
          </div>
        )}

      </div>
    </div>
  );
}
