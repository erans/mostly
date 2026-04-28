import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useTaskList, useTask } from '@/hooks/use-tasks';
import { useProject, useProjects } from '@/hooks/use-projects';
import { usePrincipals } from '@/hooks/use-principals';
import { useTaskViewState } from '@/hooks/use-task-view-state';
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
  const view = useTaskViewState();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);

  const { data: project } = useProject(projectKey ?? null);
  const { data: tasksData, isLoading } = useTaskList(
    project ? { project_id: project.id } : {},
  );
  const { data: selectedTask } = useTask(taskId ?? null);
  const { data: projectList } = useProjects();
  const { data: principalList } = usePrincipals();

  const tasks = tasksData?.items ?? [];
  const basePath = `/projects/${projectKey}`;

  const principalMap = useMemo(
    () => new Map((principalList ?? []).map((p) => [p.id, p])),
    [principalList],
  );
  const projectMap = useMemo(
    () => new Map((projectList ?? []).map((p) => [p.id, p])),
    [projectList],
  );

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
        detail={selectedTask ? (
          <TaskDetail
            task={selectedTask}
            onClose={handleCloseDetail}
            principals={principalMap}
            projects={projectMap}
          />
        ) : undefined}
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
            principals={principalMap}
            projects={projectMap}
            filters={view.filters}
            groupBy={view.groupBy}
            sortBy={view.sortBy}
            onFiltersChange={view.setFilters}
            onGroupByChange={view.setGroupBy}
            onSortByChange={view.setSortBy}
          />
        )}
      </Layout>

      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} onCreateTask={() => setFormOpen(true)} />
      {formOpen && <TaskForm onClose={() => setFormOpen(false)} defaultProjectId={project?.id} />}
    </>
  );
}
