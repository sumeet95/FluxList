/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { RoutineBlock, Interruption, Task, ScheduleItem } from '../types';
import { 
  Bed, 
  Coffee, 
  Utensils, 
  Briefcase, 
  User, 
  ShieldAlert, 
  Plus, 
  Trash2, 
  CalendarRange, 
  Clock, 
  Lock, 
  Unlock, 
  Sparkles, 
  Calendar, 
  CheckCircle2, 
  Circle,
  Eye,
  EyeOff,
  Repeat
} from 'lucide-react';

interface RoutineConfigProps {
  routineBlocks: RoutineBlock[];
  onUpdateRoutineTime: (id: string, startTime: string, endTime: string) => void;
  onUpdateRoutineBlock?: (id: string, updates: Partial<RoutineBlock>) => void;
  onAddRoutine: (block: Omit<RoutineBlock, 'id'>) => void;
  onRemoveRoutine: (id: string) => void;
  interruptions: Interruption[];
  onAddInterruption: (name: string, startTime: string, duration: number) => void;
  onRemoveInterruption: (id: string) => void;
  tasks?: Task[];
  scheduledItems?: ScheduleItem[];
  onToggleTaskStatus?: (id: string) => void;
  onScheduleTask?: (taskId: string, startTime: string) => void;
  onUnscheduleTask?: (taskId: string) => void;
  onTriggerOptimize?: () => void;
  isOptimizing?: boolean;
}

export default function RoutineConfig({
  routineBlocks,
  onUpdateRoutineTime,
  onUpdateRoutineBlock,
  onAddRoutine,
  onRemoveRoutine,
  interruptions,
  onAddInterruption,
  onRemoveInterruption,
  tasks = [],
  scheduledItems = [],
  onToggleTaskStatus,
  onScheduleTask,
  onUnscheduleTask,
  onTriggerOptimize,
  isOptimizing = false
}: RoutineConfigProps) {
  const [viewMode, setViewMode] = useState<'calendar' | 'list'>('calendar');
  const [hideSleepHours, setHideSleepHours] = useState<boolean>(true);
  const [selectedTaskIdToPlace, setSelectedTaskIdToPlace] = useState<string | null>(null);
  const [manualTime, setManualTime] = useState<string>("09:00");

  // Find contiguous groups of routine/blocked blocks
  const routineGroups = React.useMemo(() => {
    const groups: RoutineBlock[][] = [];
    const visited = new Set<string>();

    const toMins = (t: string): number => {
      if (!t) return 0;
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    // Sort blocks by start time chronologically
    const sortedBlocks = [...routineBlocks].sort((a, b) => toMins(a.startTime) - toMins(b.startTime));

    for (const block of sortedBlocks) {
      if (visited.has(block.id)) continue;

      const currentGroup: RoutineBlock[] = [block];
      visited.add(block.id);

      let added = true;
      while (added) {
        added = false;
        for (const item of sortedBlocks) {
          if (visited.has(item.id)) continue;

          const itemStart = toMins(item.startTime);
          const itemEnd = toMins(item.endTime);

          const isConnected = currentGroup.some(gBlock => {
            const gStart = toMins(gBlock.startTime);
            const gEnd = toMins(gBlock.endTime);
            // Touch or overlap condition
            return (itemEnd >= gStart && gEnd >= itemStart);
          });

          if (isConnected) {
            currentGroup.push(item);
            visited.add(item.id);
            added = true;
          }
        }
      }
      // Sort each group chronologically
      currentGroup.sort((a, b) => toMins(a.startTime) - toMins(b.startTime));
      groups.push(currentGroup);
    }
    return groups;
  }, [routineBlocks]);

  const getBGroupInfo = React.useCallback((blockId: string) => {
    const groupIdx = routineGroups.findIndex(g => g.some(b => b.id === blockId));
    if (groupIdx === -1) return { isGrouped: false, groupIndex: -1, groupSize: 0, blocks: [] as RoutineBlock[], isFirst: false, isLast: false };
    const group = routineGroups[groupIdx];
    return {
      isGrouped: group.length > 1,
      groupIndex: groupIdx,
      groupSize: group.length,
      blocks: group,
      isFirst: group[0]?.id === blockId,
      isLast: group[group.length - 1]?.id === blockId,
    };
  }, [routineGroups]);

  // Merge contiguous routine blocks into single unified block representations for simplified lists
  const mergedRoutineBlocks = React.useMemo(() => {
    return routineGroups.map(group => {
      const first = group[0];
      const last = group[group.length - 1];
      return {
        id: first.id,
        name: first.name,
        startTime: first.startTime,
        endTime: last.endTime,
        type: first.type,
        isLocked: first.isLocked,
        isRecurring: group.some(b => b.isRecurring),
        constituentIds: group.map(b => b.id),
      };
    });
  }, [routineGroups]);

  // Blocker creation state & parameters
  const [showAddRoutine, setShowAddRoutine] = useState(false);
  const [routineName, setRoutineName] = useState("");
  const [routineStart, setRoutineStart] = useState("09:00");
  const [routineEnd, setRoutineEnd] = useState("10:00");
  const [routineType, setRoutineType] = useState<'work' | 'sleep' | 'meal' | 'personal' | 'break'>("personal");
  const [routineLocked, setRoutineLocked] = useState(true);
  const [routineIsRecurring, setRoutineIsRecurring] = useState<boolean>(false);

  // Mouse drag selection states
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartHour, setDragStartHour] = useState<number | null>(null);
  const [dragEndHour, setDragEndHour] = useState<number | null>(null);
  const [selectedStartHour, setSelectedStartHour] = useState<number | null>(null);
  const [selectedEndHour, setSelectedEndHour] = useState<number | null>(null);

  // Interruption list additions
  const [interruptionName, setInterruptionName] = useState("");
  const [interruptionStart, setInterruptionStart] = useState("14:00");
  const [interruptionDuration, setInterruptionDuration] = useState(45);

  // Global mouseUp event listener to complete dragging
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        if (dragStartHour !== null && dragEndHour !== null) {
          const start = Math.min(dragStartHour, dragEndHour);
          const end = Math.max(dragStartHour, dragEndHour);
          setSelectedStartHour(start);
          setSelectedEndHour(end);
          
          // Prepopulate fields based on selection
          const startHourStr = String(start).padStart(2, '0') + ":00";
          const endHourStr = String((end + 1) === 24 ? 23 : end + 1).padStart(2, '0') + (end + 1 === 24 ? ":59" : ":00");
          setRoutineStart(startHourStr);
          setRoutineEnd(endHourStr);
          setRoutineName("Blocked Period");
          setShowAddRoutine(true);

          // Focus input
          setTimeout(() => {
            document.getElementById("dragged-block-name")?.focus();
          }, 80);
        }
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, dragStartHour, dragEndHour]);

  // Parse time to minutes
  const timeToMinutes = (t: string): number => {
    if (!t) return 0;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const handleCreateRoutineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!routineName.trim()) return;
    onAddRoutine({
      name: routineName.trim(),
      startTime: routineStart,
      endTime: routineEnd,
      type: routineType,
      isLocked: routineLocked,
      isRecurring: routineIsRecurring
    });
    setRoutineName("");
    setShowAddRoutine(false);
    setSelectedStartHour(null);
    setSelectedEndHour(null);
  };

  const handleAddInterruptionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!interruptionName.trim()) return;
    onAddInterruption(interruptionName, interruptionStart, Number(interruptionDuration));
    setInterruptionName("");
  };

  // Convert hours to 12h format
  const formatHourLabel = (h: number): string => {
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    return `${displayHour}:00 ${ampm}`;
  };

  // Proportional positioning calculators for non-round intervals
  const getMinutesPositionStyle = (startMins: number, endMins: number, currentHour: number) => {
    const hourStartMins = currentHour * 60;
    const hourEndMins = (currentHour + 1) * 60;

    const intersectStart = Math.max(hourStartMins, startMins);
    const intersectEnd = Math.min(hourEndMins, endMins);

    if (intersectStart >= intersectEnd) {
      return { top: '0%', height: '0%', display: 'none' };
    }

    const offsetStartPercent = ((intersectStart - hourStartMins) / 60) * 100;
    const durationPercent = ((intersectEnd - intersectStart) / 60) * 100;

    return {
      top: `${offsetStartPercent.toFixed(2)}%`,
      height: `${durationPercent.toFixed(2)}%`,
    };
  };

  const getPositionStyle = (startTimeStr: string, endTimeStr: string, currentHour: number) => {
    return getMinutesPositionStyle(timeToMinutes(startTimeStr), timeToMinutes(endTimeStr), currentHour);
  };

  // Fast preset creator
  const applyBlockPreset = (presetName: string, type: 'work' | 'sleep' | 'meal' | 'personal' | 'break') => {
    setRoutineName(presetName);
    setRoutineType(type);
    setRoutineLocked(true);
  };

  // Click on single hour cell fallback
  const handleHourCellClick = (hour: number) => {
    setDragStartHour(hour);
    setDragEndHour(hour);
    setSelectedStartHour(hour);
    setSelectedEndHour(hour);
    const startHourStr = String(hour).padStart(2, '0') + ":00";
    const endHourStr = String((hour + 1) === 24 ? 23 : hour + 1).padStart(2, '0') + (hour + 1 === 24 ? ":59" : ":00");
    setRoutineStart(startHourStr);
    setRoutineEnd(endHourStr);
    setRoutineName(`Blocked Period`);
    setRoutineType('personal');
    setRoutineLocked(true);
    setShowAddRoutine(true);
    // Smooth scroll page upward to form
    const container = document.getElementById("calendar-scroller");
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Drag select action handlers
  const handleDragStart = (e: React.MouseEvent, hour: number) => {
    if (e.button !== 0) return; // Left click only
    // Protect interactive elements like delete buttons from triggering dragging, except our cell drag triggers
    const target = e.target as HTMLElement;
    if ((target.closest('button') && !target.closest('.drag-trigger-cell')) || target.closest('input') || target.closest('select') || target.closest('a')) {
      return;
    }
    setIsDragging(true);
    setDragStartHour(hour);
    setDragEndHour(hour);
    setSelectedStartHour(null);
    setSelectedEndHour(null);
    e.preventDefault();
  };

  const handleDragEnter = (hour: number) => {
    if (isDragging) {
      setDragEndHour(hour);
    }
  };

  const getBlockIcon = (type: string) => {
    switch (type) {
      case 'sleep': return <Bed className="h-3.5 w-3.5 text-indigo-600 shrink-0" />;
      case 'meal': return <Utensils className="h-3.5 w-3.5 text-amber-500 shrink-0" />;
      case 'break': return <Coffee className="h-3.5 w-3.5 text-cyan-500 shrink-0" />;
      case 'work': return <Briefcase className="h-3.5 w-3.5 text-slate-500 shrink-0" />;
      default: return <User className="h-3.5 w-3.5 text-slate-400" />;
    }
  };

  // Get hours we need to display
  const hoursToDisplay = Array.from({ length: 24 }, (_, i) => i)
    .filter(h => !hideSleepHours || (h >= 6 && h <= 22));

  const unscheduledTasks = tasks.filter(t => !t.assignedTime && t.status === 'pending');

  return (
    <div className="flex-1 flex flex-col p-4 space-y-3.5 geometric-grid overflow-y-auto select-none" id="calendar-scroller">
      
      {/* Unscheduled Tasks Awaiting Placement */}
      <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-sm space-y-3 shadow-3xs text-slate-800 shrink-0">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full bg-indigo-600 animate-pulse" />
            <span className="text-[10px] font-sans font-bold text-slate-700 uppercase tracking-wider">
              Pending tasks awaiting placement ({unscheduledTasks.length})
            </span>
          </div>
          {selectedTaskIdToPlace && (
            <button
              type="button"
              onClick={() => setSelectedTaskIdToPlace(null)}
              className="text-[8.5px] font-mono uppercase bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-2 py-0.5 rounded cursor-pointer"
            >
              Clear Selection
            </button>
          )}
        </div>

        {unscheduledTasks.length > 0 ? (
          <div className="space-y-3">
            {onTriggerOptimize && (
              <div className="bg-indigo-50/50 border border-indigo-150 p-3.5 rounded-sm space-y-2.5 shadow-3xs">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="h-4.5 w-4.5 text-indigo-600 shrink-0 mt-0.5 animate-pulse" />
                  <div className="space-y-0.5">
                    <h4 className="text-[11px] font-bold text-indigo-950 font-sans uppercase tracking-wide">
                      AI Dynamic Auto-Scheduler
                    </h4>
                    <p className="text-[10px]/relaxed text-indigo-700/80 font-semibold font-sans">
                      Let Gemini automatically position your {unscheduledTasks.length} pending task{unscheduledTasks.length > 1 ? 's' : ''} on the calendar based on priority weights, ideal time of day, and duration bounds.
                    </p>
                  </div>
                </div>
                
                <button
                  type="button"
                  onClick={onTriggerOptimize}
                  disabled={isOptimizing}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white text-[10.5px] font-black uppercase tracking-wider rounded-sm shadow-xs transition-transform active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2"
                >
                  <Sparkles className="h-3.5 w-3.5 animate-bounce" />
                  <span>{isOptimizing ? "Calibrating..." : "✨ Auto-Schedule Focus Tracks"}</span>
                </button>
              </div>
            )}
            
            <p className="text-[9px]/relaxed text-slate-400 font-bold font-mono uppercase tracking-wider border-t border-slate-200 pt-2.5 flex items-center justify-between">
              <span>Or click manual placement</span>
              <span className="text-[8.5px] font-sans lowercase font-normal text-slate-400">touch empty grid slot below to set time</span>
            </p>
            
            <div className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-1">
              {unscheduledTasks.map(t => {
                const isSelected = selectedTaskIdToPlace === t.id;
                return (
                  <div
                    key={t.id}
                    onClick={() => {
                      setSelectedTaskIdToPlace(t.id);
                    }}
                    className={`p-2.5 rounded border transition-all cursor-pointer flex flex-col gap-2 ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-50/40 ring-1 ring-indigo-300 shadow-3xs'
                        : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <Circle className="h-4 w-4 text-slate-400 shrink-0" />
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-xs font-bold text-slate-800 truncate select-text">{t.title}</span>
                          <span className="text-[9.5px] text-slate-400 font-mono font-semibold mt-0.5">
                            {t.duration} mins • Priority: <span className={`font-black uppercase ${
                              t.priority === 'high' ? 'text-indigo-600' : t.priority === 'medium' ? 'text-amber-500' : 'text-blue-500'
                            }`}>{t.priority}</span>
                          </span>
                        </div>
                      </div>
                      
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaskIdToPlace(isSelected ? null : t.id);
                        }}
                        className={`text-[9.5px]/none font-black uppercase tracking-widest px-2.5 py-1.5 rounded-sm transition-transform active:scale-97 cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-slate-50 hover:bg-slate-100 text-indigo-600 border border-slate-200'
                        }`}
                      >
                        {isSelected ? 'Active' : 'Schedule'}
                      </button>
                    </div>

                    {isSelected && (
                      <div className="flex items-center gap-2 border-t border-slate-250/50 pt-2.5 animate-fadeIn" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono font-bold">
                          <span>Start (24h):</span>
                          <input
                            type="time"
                            value={manualTime}
                            onChange={(e) => setManualTime(e.target.value)}
                            className="bg-white border border-slate-200 px-2 py-1 rounded text-2xs text-slate-800 font-mono outline-hidden focus:border-indigo-500"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (onScheduleTask) {
                              onScheduleTask(t.id, manualTime);
                              setSelectedTaskIdToPlace(null);
                            }
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-[9px] font-black uppercase tracking-widest px-3 py-1.5 rounded-sm cursor-pointer ml-auto active:scale-97 transition-transform"
                        >
                          Place
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="text-center py-4 bg-white border border-dashed border-slate-200 rounded-sm p-3">
            <p className="text-2xs font-bold font-mono text-slate-400 uppercase">All Focus Tasks Placed</p>
            <p className="text-[10px] text-slate-400 mt-1 font-sans font-medium">
              Go to the <strong className="text-indigo-600 font-bold">Brain Dump</strong> tab to introduce new target tracks!
            </p>
          </div>
        )}
      </div>

      {/* Routine Blocks Quick-Creator sheet overlay (Common to both views for easy creation) */}
      {(showAddRoutine || viewMode === 'list') && (
        <div className="bg-slate-50 border border-slate-200 p-4 rounded-sm space-y-4 shadow-3xs z-30 animate-fadeIn shrink-0 text-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <div className="flex items-center gap-1.5">
              <CalendarRange className="h-4.5 w-4.5 text-indigo-600" />
              <span className="text-[10px] font-sans font-bold text-slate-700 uppercase tracking-wider">
                Create Blocked Slot
              </span>
            </div>
            {(viewMode === 'calendar' || selectedStartHour !== null) && (
              <button 
                type="button"
                onClick={() => {
                  setShowAddRoutine(false);
                  setSelectedStartHour(null);
                  setSelectedEndHour(null);
                }}
                className="text-[9px] font-bold text-slate-400 hover:text-rose-600 uppercase font-mono tracking-wider cursor-pointer bg-white hover:bg-slate-100 border border-slate-200 px-2 py-0.5 rounded transition-colors"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="space-y-3.5">
            {/* Direct, single high-fidelity time adjustment inputs */}
            <div className="grid grid-cols-2 gap-2 text-[10px]/snug">
              <div>
                <label className="block text-[8px] uppercase font-mono font-bold text-slate-500 mb-1">Start Time (24h)</label>
                <input
                  type="time"
                  value={routineStart}
                  onChange={(e) => setRoutineStart(e.target.value)}
                  className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded text-2xs font-mono text-slate-850 outline-none focus:border-indigo-500 shadow-3xs"
                />
              </div>
              <div>
                <label className="block text-[8px] uppercase font-mono font-bold text-slate-500 mb-1">End Time (24h)</label>
                <input
                  type="time"
                  value={routineEnd}
                  onChange={(e) => setRoutineEnd(e.target.value)}
                  className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded text-2xs font-mono text-slate-850 outline-none focus:border-indigo-500 shadow-3xs"
                />
              </div>
            </div>

            {/* Exactly two immediate-action buttons */}
            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  onAddRoutine({
                    name: "Blocked Time",
                    startTime: routineStart,
                    endTime: routineEnd,
                    type: "personal",
                    isLocked: true,
                    isRecurring: false
                  });
                  setShowAddRoutine(false);
                  setSelectedStartHour(null);
                  setSelectedEndHour(null);
                }}
                className="bg-white hover:bg-slate-50 text-slate-700 text-[10px] font-black uppercase tracking-widest py-3 rounded-sm cursor-pointer transition-all active:scale-97 flex flex-col items-center justify-center gap-1 border border-slate-200 shadow-3xs"
              >
                <Calendar className="h-4 w-4 text-slate-550" />
                <span>One-Time Block</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onAddRoutine({
                    name: "Blocked Time",
                    startTime: routineStart,
                    endTime: routineEnd,
                    type: "personal",
                    isLocked: true,
                    isRecurring: true
                  });
                  setShowAddRoutine(false);
                  setSelectedStartHour(null);
                  setSelectedEndHour(null);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest py-3 rounded-sm cursor-pointer transition-all active:scale-97 flex flex-col items-center justify-center gap-1 border border-transparent shadow-md font-bold"
              >
                <Repeat className="h-4 w-4 text-indigo-200" />
                <span>Recurring Daily</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RENDER MODES */}

      {/* OUTLOOK DAY GRID VIEW */}
      {viewMode === 'calendar' && (
        <div className="flex-1 flex flex-col space-y-3 z-10 animate-fadeIn">
          
          {/* Calendar top metrics & switches */}
          <div className="flex items-center justify-between text-2xs font-mono border-b border-slate-150 pb-2">
            <span className="font-extrabold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-indigo-505 animate-pulse" /> Outlook Day Grid
            </span>
            <button
              onClick={() => setHideSleepHours(!hideSleepHours)}
              className="text-[9px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-150 px-2 py-1 rounded-sm cursor-pointer flex items-center gap-1 shadow-3xs"
            >
              {hideSleepHours ? (
                <>
                  <Eye className="h-3.5 w-3.5" /> Show All 24H
                </>
              ) : (
                <>
                  <EyeOff className="h-3.5 w-3.5" /> Show Active 6A-10P
                </>
              )}
            </button>
          </div>

          {/* Active selection live notification overlay */}
          {isDragging && dragStartHour !== null && dragEndHour !== null && (
            <div className="bg-indigo-600 text-white font-mono text-[10px] font-bold p-2 px-3 rounded-sm flex items-center justify-between shadow-md transition-all animate-fadeIn">
              <span>🎯 Custom blocking range:</span>
              <span className="bg-indigo-850 px-2 py-0.5 rounded border border-indigo-400">
                {formatHourLabel(Math.min(dragStartHour, dragEndHour))} to {formatHourLabel(Math.max(dragStartHour, dragEndHour) + 1)}
              </span>
            </div>
          )}

          {/* Visual hourly tracker columns */}
          <div className="border border-slate-200 rounded-sm bg-white shadow-3xs divide-y divide-slate-100 relative">
            {hoursToDisplay.map((h) => {
              // Gather conflicting blockers
              const overlappingRoutines = routineBlocks.filter(b => {
                const start = timeToMinutes(b.startTime);
                const end = timeToMinutes(b.endTime);
                const hourStart = h * 60;
                const hourEnd = (h + 1) * 60;
                return start < hourEnd && end > hourStart;
              });

              // Gather scheduled tasks
              const overlappingTasks = scheduledItems.filter(item => {
                const start = timeToMinutes(item.startTime);
                const end = timeToMinutes(item.endTime);
                const hourStart = h * 60;
                const hourEnd = (h + 1) * 60;
                return start < hourEnd && end > hourStart;
              }).map(item => {
                const task = tasks.find(t => t.id === item.taskId);
                return { ...item, status: task?.status || 'pending' };
              });

              // Gather interruptions
              const overlappingInterruptions = interruptions.filter(item => {
                const start = timeToMinutes(item.startTime);
                const end = start + item.duration;
                const hourStart = h * 60;
                const hourEnd = (h + 1) * 60;
                return start < hourEnd && end > hourStart;
              });

              const hasItems = overlappingRoutines.length > 0 || overlappingTasks.length > 0 || overlappingInterruptions.length > 0;

              // Check if currently selected by drag
              const isSelectedByDrag = isDragging && 
                dragStartHour !== null && 
                dragEndHour !== null && 
                h >= Math.min(dragStartHour, dragEndHour) && 
                h <= Math.max(dragStartHour, dragEndHour);

              const isSelectedConfirmed = !isDragging && 
                selectedStartHour !== null && 
                selectedEndHour !== null && 
                h >= selectedStartHour && 
                h <= selectedEndHour;

              return (
                <div 
                  key={h} 
                  className={`flex relative items-stretch group hover:bg-slate-50/50 h-24 transition-colors ${
                    isSelectedByDrag ? 'bg-indigo-50/55' : isSelectedConfirmed ? 'bg-indigo-50/20' : ''
                  }`}
                  onMouseDown={(e) => handleDragStart(e, h)}
                  onMouseEnter={() => handleDragEnter(h)}
                >
                  {/* Left Hour timestamp column (Outlook style) */}
                  <div className="w-16 bg-slate-50/60 border-r border-slate-200/60 p-2 text-right select-none font-mono text-[9px] font-bold text-slate-400 flex flex-col justify-start">
                    <span>{formatHourLabel(h)}</span>
                  </div>

                  {/* Right schedule canvas slot */}
                  <div className="flex-1 relative select-none h-full bg-slate-50/5">
                    {/* Visual drag placeholder overlay */}
                    {isSelectedByDrag && (
                      <div className="absolute inset-x-2 inset-y-1 bg-indigo-500/10 border border-dashed border-indigo-400 rounded-xs flex items-center justify-center p-1 pointer-events-none z-10 transition-colors">
                        <span className="text-[8px] font-mono font-black text-indigo-700 bg-white/90 border border-indigo-200/50 rounded px-1 animate-pulse">
                          SELECTING TARGET SLOT
                        </span>
                      </div>
                    )}

                    {/* Pre-confirmed block selection placeholder */}
                    {isSelectedConfirmed && (
                      <div className="absolute inset-x-2 inset-y-1 bg-indigo-600/5 border-2 border-indigo-600/40 border-dashed rounded-xs flex items-center justify-center p-1 pointer-events-none z-10">
                        <span className="text-[8px] font-mono font-bold text-indigo-800 bg-indigo-100 flex items-center gap-1 px-1 rounded">
                          <Clock className="w-2.5 h-2.5 animate-spin" /> CONFIGURING TIME BLOCKS
                        </span>
                      </div>
                    )}

                    {selectedTaskIdToPlace ? (
                      <button
                        onClick={() => {
                          const targetTime = String(h).padStart(2, '0') + ":00";
                          if (onScheduleTask) {
                            onScheduleTask(selectedTaskIdToPlace, targetTime);
                            setSelectedTaskIdToPlace(null);
                          }
                        }}
                        type="button"
                        className="absolute inset-0 w-full h-full bg-emerald-50 hover:bg-emerald-100 border border-dashed border-emerald-400 text-emerald-800 text-[10.5px] font-black uppercase tracking-wide font-mono flex items-center justify-center cursor-pointer transition-all z-30 animate-pulse"
                      >
                        📍 Schedule task here at {String(h).padStart(2, '0')}:00
                      </button>
                    ) : (
                      /* Hover state overlay helper to invite clicking for fast-add when no selection active */
                      !hasItems && !isDragging && selectedStartHour === null && (
                        <button
                          onClick={() => handleHourCellClick(h)}
                          type="button"
                          className="drag-trigger-cell absolute inset-0 w-full h-full opacity-0 hover:opacity-100 bg-indigo-50/30 text-indigo-700 text-[10px] font-black uppercase tracking-widest font-mono flex items-center justify-center cursor-pointer transition-all z-20"
                        >
                          + Drag or Click to Block off
                        </button>
                      )
                    )}
                    {overlappingRoutines.map(b => {
                      const { isGrouped, groupIndex, groupSize, blocks } = getBGroupInfo(b.id);
                      const groupBlocks = blocks && blocks.length > 0 ? blocks : [b];
                      const groupLetter = groupIndex >= 0 ? String.fromCharCode(65 + (groupIndex % 26)) : 'A';

                      const toMins = (t: string): number => {
                        if (!t) return 0;
                        const [hours, mins] = t.split(':').map(Number);
                        return hours * 60 + mins;
                      };
                      const startMins = Math.min(...groupBlocks.map(blk => toMins(blk.startTime)));
                      const endMins = Math.max(...groupBlocks.map(blk => toMins(blk.endTime)));

                      const groupStartHour = Math.floor(startMins / 60);
                      const groupEndHour = Math.ceil(endMins / 60);
                      const totalHoursSpan = groupEndHour - groupStartHour;

                      const isSeamless = totalHoursSpan > 1;
                      const isFirst = isSeamless ? (h === groupStartHour) : true;
                      const isLast = isSeamless ? (h === groupEndHour - 1) : true;

                      // Use full time range for multiple hour spans
                      const firstBlock = groupBlocks[0];
                      const lastBlock = groupBlocks[groupBlocks.length - 1];
                      const fullRange = firstBlock && lastBlock ? `${firstBlock.startTime} - ${lastBlock.endTime}` : `${b.startTime} - ${b.endTime}`;

                      // Simple light colors that integration perfectly into the day grid without stark contrast
                      const borderLeftColor = b.isRecurring ? 'border-l-indigo-500' : 'border-l-rose-500';
                      const cardBg = b.isRecurring ? 'bg-indigo-50/40 hover:bg-indigo-50/60' : 'bg-slate-50/90 hover:bg-slate-100/90';

                      const roundedClass = isSeamless
                        ? isFirst
                          ? 'rounded-t-sm rounded-b-none border-b-0'
                          : isLast
                          ? 'rounded-b-sm rounded-t-none border-t-0'
                          : 'rounded-none border-y-0'
                        : 'rounded-sm';

                      const posStyle = getPositionStyle(b.startTime, b.endTime, h);

                      return (
                        <React.Fragment key={b.id}>
                          <div 
                            style={posStyle}
                            className={`transition-all duration-150 border border-slate-200/90 ${borderLeftColor} ${cardBg} border-l-[4px] absolute flex text-3xs sm:text-2xs z-10 font-medium ${roundedClass} ${
                              overlappingTasks.length > 0 ? 'left-1 right-[50%]' : 'left-1.5 right-1.5'
                            } overflow-hidden px-1.5 py-1 items-center justify-between shadow-3xs`}
                          >
                            {(!isSeamless || isFirst) ? (
                              <>
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <Lock className="h-3 w-3 text-slate-400 shrink-0" />
                                  <div className="flex flex-wrap items-center gap-1 min-w-0">
                                    <span className="font-sans font-bold text-slate-700 truncate max-w-[80px]">
                                      Blocked
                                    </span>
                                    {/* Clear time label and frequency badges */}
                                    <span className="font-mono text-[9px] font-bold bg-white text-slate-700 px-1 py-0.5 rounded border border-slate-200/70 select-none">
                                      {isSeamless ? fullRange : `${b.startTime} - ${b.endTime}`}
                                    </span>
                                  </div>
                                </div>
                                <div className="flex items-center shrink-0 ml-1">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onRemoveRoutine(b.id); }}
                                    className="p-1 rounded bg-white hover:bg-rose-50 border border-slate-200 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer shadow-3xs"
                                    title={isSeamless ? `Unblock connected contiguous slots` : "Unblock Blocked Slot"}
                                  >
                                    <Trash2 className="h-2.5 w-2.5" />
                                  </button>
                                </div>
                              </>
                            ) : (
                              /* Elegant seamless vertical connection spacer and subtitle */
                              <div className="w-full h-full min-h-[16px] flex items-center justify-center opacity-25 select-none font-mono text-[8px] text-slate-400">
                                <span>••• continued •••</span>
                              </div>
                            )}
                          </div>
                        </React.Fragment>
                      );
                    })}

                    {/* Blockers: Interruptions list */}
                    {overlappingInterruptions.map(item => {
                      const itemStartMins = timeToMinutes(item.startTime);
                      const itemEndMins = itemStartMins + item.duration;
                      const posStyle = getMinutesPositionStyle(itemStartMins, itemEndMins, h);

                      return (
                        <div 
                          key={item.id} 
                          style={posStyle}
                          className="bg-rose-50 border border-rose-200/90 p-1 px-2 rounded-sm flex items-center justify-between text-2xs font-semibold text-rose-900 border-l-[4px] border-l-rose-505 animate-pulse absolute left-2 right-2 z-20 shadow-3xs overflow-hidden"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <ShieldAlert className="h-3.5 w-3.5 text-rose-500 shrink-0" />
                            <span className="font-extrabold truncate text-3xs sm:text-2xs">{item.name}</span>
                            <span className="text-[8px] font-mono font-normal opacity-85">({item.startTime} • {item.duration}m)</span>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRemoveInterruption(item.id); }}
                            className="p-1 rounded text-rose-450 hover:text-rose-700 transition-colors cursor-pointer shrink-0 ml-1"
                            title="Remove interruption blocker"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}

                    {/* Strategically Placed Task items by Gemini */}
                    {overlappingTasks.map(item => {
                      const isComp = item.status === 'completed';
                      const taskStart = item.startTime;
                      const taskEnd = item.endTime;
                      const posStyle = getPositionStyle(taskStart, taskEnd, h);

                      return (
                        <div 
                          key={item.taskId} 
                          style={posStyle}
                          className={`bg-white border p-1 rounded-sm shadow-3xs flex items-center justify-between text-2xs absolute overflow-hidden transition-all group z-10 ${
                            overlappingRoutines.length > 0 ? 'left-[51%] right-1' : 'left-1.5 right-1.5'
                          } ${
                            isComp
                              ? 'border-slate-200 text-slate-400 opacity-60 bg-slate-50/50'
                              : item.priority === 'high'
                              ? 'border-l-indigo-500 border-l-[4.5px] border-indigo-250 hover:border-indigo-400 font-bold'
                              : item.priority === 'medium'
                              ? 'border-l-amber-500 border-l-[4.5px] border-slate-250 hover:border-amber-400 font-bold'
                              : 'border-l-blue-400 border-l-[4.5px] border-slate-250 hover:border-blue-450'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 min-w-0 max-w-[80%]">
                            {onToggleTaskStatus ? (
                              <button 
                                type="button"
                                onClick={(e) => { e.stopPropagation(); onToggleTaskStatus(item.taskId); }}
                                className="focus:outline-hidden hover:scale-105 active:scale-95 transition-transform shrink-0"
                              >
                                {isComp ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                ) : (
                                  <Circle className="h-3.5 w-3.5 text-slate-450 hover:text-indigo-600 shrink-0" />
                                )}
                              </button>
                            ) : (
                              <div className="h-2.5 w-2.5 rounded-full bg-slate-200 shrink-0" />
                            )}
                            <div className="flex flex-col min-w-0">
                              <span className={`text-slate-800 text-3xs sm:text-2xs truncate ${isComp ? 'line-through text-slate-400 font-normal' : ''}`}>
                                {item.taskTitle}
                              </span>
                              <span className="text-[7.5px] font-mono text-slate-400 font-normal mt-0.5">
                                scheduled {item.startTime}-{item.endTime}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0 ml-1">
                            {item.isDeepWork && (
                              <span className="text-[7px]/none uppercase font-mono font-black bg-indigo-50 text-indigo-700 border border-indigo-150 rounded-xs px-1 select-none font-bold">
                                FOCUS
                              </span>
                            )}
                            {onUnscheduleTask && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onUnscheduleTask(item.taskId);
                                }}
                                className="p-0.5 border border-slate-200 bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-sm cursor-pointer transition-colors shadow-3xs"
                                title="Unschedule task"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                            <Sparkles className="h-3 w-3 text-indigo-500" />
                          </div>
                        </div>
                      );
                    })}

                    {/* Empty Hour state info indicator completely removed */}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Raw Setup / Configuration view (Original lists & forms) */}
      {viewMode === 'list' && (
        <div className="space-y-4 z-10 animate-fadeIn">
          
          {/* Default Blocker Routine list editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1 w-full z-10">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Current Blocked Rules</h3>
              <span className="text-[9.5px] text-slate-500 font-mono font-semibold">
                Total constraints: {routineBlocks.length}
              </span>
            </div>

            <div className="space-y-2.5">
              {mergedRoutineBlocks.map((block) => {
                const { isGrouped, groupIndex, groupSize } = getBGroupInfo(block.id);
                const groupLetter = String.fromCharCode(65 + (groupIndex % 26));
                return (
                  <div key={block.id} className="bg-white border border-slate-200 p-3.5 rounded-sm space-y-3 shadow-3xs hover:border-slate-300 transition-colors animate-fadeIn text-slate-800">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-rose-500 animate-pulse" />
                        <div>
                          {/* Highlights start and end hours */}
                          <span className="font-mono text-[10px] font-bold bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200/80 text-slate-700">
                            {block.startTime} — {block.endTime}
                          </span>
                        </div>
                        {isGrouped && (
                          <span className="inline-flex items-center gap-1 text-[8px] bg-indigo-50 text-indigo-600 font-mono font-bold px-1.5 py-0.5 rounded border border-indigo-100/70" title={`Connected with ${groupSize - 1} other blocks`}>
                            🔗 Chain {groupLetter} ({groupSize} slots)
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => onRemoveRoutine(block.id)}
                        className="text-slate-400 hover:text-rose-600 p-1.5 rounded-sm bg-white hover:bg-rose-50 border border-slate-200 transition-colors cursor-pointer shadow-3xs"
                        title={isGrouped ? `Delete all ${groupSize} slots connected in Chain ${groupLetter}` : "Remove Routine Block"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[8px] uppercase font-mono font-extrabold text-slate-400 mb-0.5">Start Time (24h)</label>
                        <input
                          type="time"
                          value={block.startTime}
                          onChange={(e) => onUpdateRoutineTime(block.id, e.target.value, block.endTime)}
                          className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded text-2xs text-slate-800 font-mono focus:border-indigo-500 outline-none shadow-3xs"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] uppercase font-mono font-extrabold text-slate-400 mb-0.5">End Time (24h)</label>
                        <input
                          type="time"
                          value={block.endTime}
                          onChange={(e) => onUpdateRoutineTime(block.id, block.startTime, e.target.value)}
                          className="w-full bg-slate-50 border border-slate-200 px-2 py-1 rounded text-2xs text-slate-800 font-mono focus:border-indigo-500 outline-none shadow-3xs"
                        />
                      </div>
                    </div>

                    {/* Frequency toggle switcher row */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-2xs font-mono">
                      <span className="text-slate-400 font-bold uppercase text-[8px]">Frequency Pattern:</span>
                      {onUpdateRoutineBlock ? (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => onUpdateRoutineBlock(block.id, { isRecurring: false })}
                            className={`px-2 py-0.5 rounded-xs border text-[9px] font-bold uppercase transition-all cursor-pointer ${
                              !block.isRecurring 
                                ? 'bg-slate-855 border-slate-800 text-white font-bold' 
                                : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                            }`}
                          >
                            📆 One-time
                          </button>
                          <button
                            type="button"
                            onClick={() => onUpdateRoutineBlock(block.id, { isRecurring: true })}
                            className={`px-2 py-0.5 rounded-xs border text-[9px] font-bold uppercase transition-all cursor-pointer ${
                              block.isRecurring 
                                ? 'bg-indigo-600 border-indigo-500 text-white font-bold' 
                                : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                            }`}
                          >
                            🔁 Recurring
                          </button>
                        </div>
                      ) : (
                        <span className="font-extrabold text-indigo-600 uppercase">
                          {block.isRecurring ? '🔁 Recurring' : '📆 One-Time'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

              {routineBlocks.length === 0 && (
                <div className="text-center py-6 border border-dashed border-slate-300 rounded-sm bg-slate-50/55 p-3">
                  <p className="text-2xs font-bold font-mono text-slate-400 uppercase">No active time blocks</p>
                  <p className="text-[10px] text-slate-400 mt-1 font-sans">Everything is open for dynamic optimization!</p>
                </div>
              )}
            </div>

          {/* Dynamic real-time blocker injections form */}
          <div className="bg-white border border-slate-200 p-4 rounded-sm space-y-3 shadow-3xs">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-rose-600 animate-pulse" />
              <div>
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide font-mono">Calibrate Real-Time Interruption</h3>
                <p className="text-[10px] text-slate-400 font-medium">Inject emergency meetings or blockers on the fly</p>
              </div>
            </div>

            <form onSubmit={handleAddInterruptionSubmit} className="space-y-2.5 bg-slate-100/60 p-3 rounded-sm border border-slate-250">
              <div>
                <label className="block text-[8.5px] uppercase font-mono font-extrabold text-slate-400 mb-1">Blocker Event Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Urgent Incident Meeting"
                  value={interruptionName}
                  onChange={(e) => setInterruptionName(e.target.value)}
                  className="w-full bg-white border border-slate-200 px-2.5 py-1.5 rounded-sm text-xs text-slate-850 focus:border-rose-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[8.5px] uppercase font-mono font-extrabold text-slate-400 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={interruptionStart}
                    onChange={(e) => setInterruptionStart(e.target.value)}
                    className="w-full bg-white border border-slate-250 px-2.5 py-1.5 rounded-sm text-xs text-slate-800 font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[8.5px] uppercase font-mono font-extrabold text-slate-400 mb-1">Duration (mins)</label>
                  <select
                    value={interruptionDuration}
                    onChange={(e) => setInterruptionDuration(Number(e.target.value))}
                    className="w-full bg-white border border-slate-250 px-2.5 py-1.5 rounded-sm text-xs text-slate-850 font-mono outline-none"
                  >
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins</option>
                    <option value={90}>90 mins</option>
                    <option value={120}>120 mins</option>
                  </select>
                </div>
              </div>

              <button
                type="submit"
                className="w-full bg-rose-600 hover:bg-rose-700 text-white text-[9.5px] font-bold uppercase tracking-widest py-2 rounded-sm cursor-pointer transition-colors active:scale-98 flex items-center justify-center gap-1.5"
              >
                <Plus className="h-4 w-4" /> Inject Blocker Rule
              </button>
            </form>

            {interruptions.length > 0 && (
              <div className="space-y-1.5 mt-2">
                <h4 className="text-[8.5px] font-extrabold tracking-wider text-rose-600 font-mono uppercase">Applied Blockers</h4>
                {interruptions.map((item) => (
                  <div key={item.id} className="bg-rose-50 border border-rose-100 p-2 rounded-sm flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-rose-500" />
                      <div>
                        <span className="font-bold text-rose-800">{item.name}</span>
                        <span className="block text-[10px] text-slate-500 font-mono">{item.startTime} • {item.duration} mins</span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onRemoveInterruption(item.id)}
                      className="text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}

    </div>
  );
}
