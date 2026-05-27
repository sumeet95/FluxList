/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Task {
  id: string;
  title: string;
  duration: number; // in minutes
  priority: 'high' | 'medium' | 'low';
  preferredWindow: 'morning' | 'afternoon' | 'evening' | 'any';
  status: 'pending' | 'completed' | 'missed';
  isDeepWork: boolean;
  notes?: string;
  assignedTime?: string | null; // HH:MM
  shuffledAt?: number; // Optional timestamp of last shuffle
}

export interface RoutineBlock {
  id: string;
  name: string;
  type: 'work' | 'sleep' | 'meal' | 'personal' | 'break';
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  isLocked: boolean; // tasks cannot be scheduled inside locked blocks if true (e.g. sleep, meals)
  isRecurring?: boolean; // True if it is recurring, false or undefined if one-time
}

export interface Interruption {
  id: string;
  name: string;
  startTime: string; // HH:MM
  duration: number; // in minutes
}

export interface ScheduleItem {
  taskId: string;
  taskTitle: string;
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  isDeepWork: boolean;
  priority: 'high' | 'medium' | 'low';
}

export interface OptimizationResponse {
  scheduledItems: ScheduleItem[];
  explanation: string;
  productivityScore: number;
  unresolvedTasks: { taskId: string; title: string; reason: string }[];
}
