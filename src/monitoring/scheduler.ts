import type { ExtractionConfig } from '../extraction-schema.js';

export type ScheduledCallback = (config: ExtractionConfig) => Promise<unknown>;

export interface ScheduledTask {
  id: string;
  url: string;
  intervalMs: number;
  config: Partial<ExtractionConfig>;
  callback: ScheduledCallback;
  intervalId: ReturnType<typeof setInterval> | null;
  paused: boolean;
  nextRunTime: Date | null;
  lastRunTime: Date | null;
}

const schedules = new Map<string, ScheduledTask>();

export function createSchedule(
  id: string,
  url: string,
  intervalMs: number,
  callback: ScheduledCallback,
  config: Partial<ExtractionConfig> = {}
): ScheduledTask {
  if (schedules.has(id)) {
    throw new Error(`Schedule with id "${id}" already exists`);
  }

  const task: ScheduledTask = {
    id,
    url,
    intervalMs,
    config,
    callback,
    intervalId: null,
    paused: false,
    nextRunTime: new Date(Date.now() + intervalMs),
    lastRunTime: null,
  };

  schedules.set(id, task);
  return task;
}

export function removeSchedule(id: string): boolean {
  const task = schedules.get(id);
  if (!task) return false;
  if (task.intervalId) {
    clearInterval(task.intervalId);
  }
  schedules.delete(id);
  return true;
}

export function pauseSchedule(id: string): boolean {
  const task = schedules.get(id);
  if (!task || !task.intervalId) return false;
  task.paused = true;
  if (task.intervalId) {
    clearInterval(task.intervalId);
    task.intervalId = null;
  }
  return true;
}

export function resumeSchedule(id: string): boolean {
  const task = schedules.get(id);
  if (!task) return false;
  task.paused = false;
  task.nextRunTime = new Date(Date.now() + task.intervalMs);
  startTaskInterval(task);
  return true;
}

export function getNextRunTime(id: string): Date | null {
  const task = schedules.get(id);
  return task?.nextRunTime ?? null;
}

export function startScheduler(): void {
  for (const task of schedules.values()) {
    if (!task.intervalId && !task.paused) {
      startTaskInterval(task);
    }
  }
}

function startTaskInterval(task: ScheduledTask): void {
  task.intervalId = setInterval(async () => {
    task.lastRunTime = new Date();
    task.nextRunTime = new Date(Date.now() + task.intervalMs);
    try {
      const fullConfig = { url: task.url, ...task.config } as ExtractionConfig;
      await task.callback(fullConfig);
    } catch (error) {
      console.error(`Scheduled extraction failed for ${task.url}:`, error);
    }
  }, task.intervalMs);
}

export function getAllSchedules(): ScheduledTask[] {
  return Array.from(schedules.values());
}

export function getSchedule(id: string): ScheduledTask | undefined {
  return schedules.get(id);
}
