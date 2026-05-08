'use client';

import { ScrollArea } from '@/components/ui/scroll-area';
import { StatusBadge } from '@/components/shared';
import { TaskCard } from './task-card';
import { useT } from '@/lib/i18n';
import type { Task, TaskStatus } from '@/lib/types';

interface KanbanColumn {
  status: TaskStatus;
  tasks: Task[];
}

interface KanbanBoardProps {
  tasks: Task[];
  completedTodayTasks: Task[];
  onTaskClick: (task: Task) => void;
}

export function KanbanBoard({ tasks, completedTodayTasks, onTaskClick }: KanbanBoardProps) {
  const t = useT();
  const columns: KanbanColumn[] = [
    { status: 'pending', tasks: tasks.filter((task) => task.status === 'pending') },
    { status: 'in_progress', tasks: tasks.filter((task) => task.status === 'in_progress') },
    { status: 'blocked', tasks: tasks.filter((task) => task.status === 'blocked') },
    { status: 'completed', tasks: completedTodayTasks },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
      {columns.map((col) => (
        <div key={col.status} className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <StatusBadge status={col.status} />
              <span className="text-xs text-muted-foreground">
                {col.tasks.length}
              </span>
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-280px)] min-h-[300px]">
            <div className="flex flex-col gap-2 px-0.5 pt-0.5 pb-1">
              {col.tasks.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                  {t.pages.tasks.kanbanEmpty}
                </p>
              ) : (
                col.tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={onTaskClick}
                  />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      ))}
    </div>
  );
}
