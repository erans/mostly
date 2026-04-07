import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useTaskList, useTask } from '@/hooks/use-tasks';
import { TaskList } from '@/components/task-list';
import { TaskDetail } from '@/components/task-detail';
import { Layout } from '@/components/layout';
import { TaskForm } from '@/components/task-form';
import { CommandPalette } from '@/components/command-palette';
import { useKeyboard } from '@/hooks/use-keyboard';
import type { Task, TaskListParams } from '@mostly/types';

export function TasksPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  // Determine which view we're in
  const basePath = location.pathname.split('/').slice(0, 3).join('/');
  let title = 'All Tasks';
  let filters: Partial<TaskListParams> = {};

  if (basePath === '/tasks/my') {
    title = 'My Tasks';
    // We need the principal ID; for now filter by assignee handle won't work directly.
    // The API filters by assignee_id, so we'll pass it once we have it.
  } else if (basePath === '/views/blocked') {
    title = 'Blocked';
    filters = { status: 'blocked' };
  } else if (basePath === '/views/claims') {
    title = 'Active Claims';
    // Filter for tasks with active claims — the API doesn't have a direct filter,
    // so we show claimed + in_progress tasks as a proxy
    filters = { status: 'claimed' };
  }

  const { data: tasksData, isLoading } = useTaskList(filters);
  const { data: selectedTask } = useTask(taskId ?? null);

  const tasks = tasksData?.items ?? [];

  const handleSelectTask = useCallback((task: Task) => {
    const pathPrefix = basePath;
    navigate(`${pathPrefix}/${task.id}`);
  }, [navigate, basePath]);

  const handleCloseDetail = useCallback(() => {
    navigate(basePath);
  }, [navigate, basePath]);

  useKeyboard(useMemo(() => ({
    'cmd+k': () => setCmdOpen(true),
    'escape': () => { setCmdOpen(false); setFormOpen(false); if (taskId) handleCloseDetail(); },
    'c': () => setFormOpen(true),
  }), [taskId, handleCloseDetail]));

  return (
    <>
      <Layout
        onCommandPalette={() => setCmdOpen(true)}
        detail={selectedTask ? <TaskDetail task={selectedTask} onClose={handleCloseDetail} /> : undefined}
        onCloseDetail={handleCloseDetail}
      >
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-text-muted">Loading...</div>
        ) : (
          <TaskList
            title={title}
            tasks={tasks}
            selectedTaskId={taskId ?? null}
            onSelectTask={handleSelectTask}
          />
        )}
      </Layout>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onCreateTask={() => setFormOpen(true)} />
      {formOpen && <TaskForm onClose={() => setFormOpen(false)} />}
    </>
  );
}
