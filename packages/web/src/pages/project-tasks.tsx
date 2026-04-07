import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTaskList, useTask } from '@/hooks/use-tasks';
import { useProject } from '@/hooks/use-projects';
import { TaskList } from '@/components/task-list';
import { TaskDetail } from '@/components/task-detail';
import { Layout } from '@/components/layout';
import { TaskForm } from '@/components/task-form';
import { CommandPalette } from '@/components/command-palette';
import { useKeyboard } from '@/hooks/use-keyboard';
import type { Task } from '@mostly/types';

export function ProjectTasksPage() {
  const { projectKey, taskId } = useParams();
  const navigate = useNavigate();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const { data: project } = useProject(projectKey ?? null);
  const { data: tasksData, isLoading } = useTaskList(
    project ? { project_id: project.id } : {},
  );
  const { data: selectedTask } = useTask(taskId ?? null);

  const tasks = tasksData?.items ?? [];
  const basePath = `/projects/${projectKey}`;

  const handleSelectTask = useCallback((task: Task) => {
    navigate(`${basePath}/${task.id}`);
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
            title={project?.name ?? projectKey ?? 'Project'}
            tasks={tasks}
            selectedTaskId={taskId ?? null}
            onSelectTask={handleSelectTask}
          />
        )}
      </Layout>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onCreateTask={() => setFormOpen(true)} />
      {formOpen && <TaskForm onClose={() => setFormOpen(false)} defaultProjectId={project?.id} />}
    </>
  );
}
