import { useState, useMemo, useCallback, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { useTaskList, useTask, useClaimTask, useReleaseTask } from '@/hooks/use-tasks';
import { useProjects } from '@/hooks/use-projects';
import { usePrincipals } from '@/hooks/use-principals';
import { useAuth } from '@/hooks/use-auth';
import { useTaskViewState } from '@/hooks/use-task-view-state';
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
  const { user } = useAuth();
  const view = useTaskViewState();

  const [cmdOpen, setCmdOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [orderedTasks, setOrderedTasks] = useState<Task[]>([]);
  // Bumping this token sends a one-shot "open the transition form" signal to
  // TaskDetail. Using a counter (not a boolean) lets the same shortcut fire
  // repeatedly without TaskDetail needing to clear the flag.
  const [transitionRequestToken, setTransitionRequestToken] = useState(0);

  // Determine which view we're in
  const basePath = location.pathname.split('/').slice(0, 3).join('/');
  let title = 'All Tasks';
  let filters: Partial<TaskListParams> = {};
  // Some views (Active Claims) need post-fetch filtering because the API
  // doesn't expose the exact predicate we want.
  let postFilter: ((t: Task) => boolean) | null = null;

  if (basePath === '/tasks/my') {
    title = 'My Tasks';
    if (user) filters = { assignee_id: user.id };
  } else if (basePath === '/views/blocked') {
    title = 'Blocked';
    filters = { status: 'blocked' };
  } else if (basePath === '/views/claims') {
    title = 'Active Claims';
    // "Active claims" = anything with a live claimer. The API has no direct
    // claimed_by != null filter, so fetch all and filter client-side.
    postFilter = (t) => t.claimed_by_id != null;
  }

  const { data: tasksData, isLoading } = useTaskList(filters);
  const { data: selectedTask } = useTask(taskId ?? null);
  const { data: projectList } = useProjects();
  const { data: principalList } = usePrincipals();
  const claimMutation = useClaimTask();
  const releaseMutation = useReleaseTask();

  const tasks = useMemo(() => {
    const items = tasksData?.items ?? [];
    return postFilter ? items.filter(postFilter) : items;
  }, [tasksData, postFilter]);

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

  // Reset highlight when the task set changes (avoid pointing at a missing id).
  useEffect(() => {
    if (highlightedId && !orderedTasks.some((t) => t.id === highlightedId)) {
      setHighlightedId(null);
    }
  }, [orderedTasks, highlightedId]);

  // Keep highlight in sync with the currently open detail task — opening a
  // task via mouse should also move the j/k cursor there.
  useEffect(() => {
    if (taskId) setHighlightedId(taskId);
  }, [taskId]);

  function moveHighlight(delta: 1 | -1) {
    if (orderedTasks.length === 0) return;
    const currentId = highlightedId ?? taskId ?? null;
    const currentIdx = currentId ? orderedTasks.findIndex((t) => t.id === currentId) : -1;
    let nextIdx: number;
    if (currentIdx === -1) {
      nextIdx = delta === 1 ? 0 : orderedTasks.length - 1;
    } else {
      nextIdx = Math.max(0, Math.min(orderedTasks.length - 1, currentIdx + delta));
    }
    const next = orderedTasks[nextIdx];
    setHighlightedId(next.id);
    // Scroll the row into view if it's offscreen.
    const el = document.querySelector(`[data-task-row="${next.id}"]`);
    if (el && 'scrollIntoView' in el) {
      (el as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
  }

  function openHighlighted() {
    const target = highlightedId ?? orderedTasks[0]?.id;
    if (!target) return;
    const t = orderedTasks.find((x) => x.id === target);
    if (t) handleSelectTask(t);
  }

  function claimToggleHighlighted() {
    const target = highlightedId ?? taskId;
    if (!target) return;
    const t = orderedTasks.find((x) => x.id === target);
    if (!t) return;
    if (t.claimed_by_id) {
      releaseMutation.mutate({ id: t.id, expected_version: t.version });
    } else {
      claimMutation.mutate({ id: t.id, expected_version: t.version });
    }
  }

  function transitionHighlighted() {
    const target = highlightedId ?? taskId;
    if (!target) return;
    const t = orderedTasks.find((x) => x.id === target);
    if (!t) return;
    // Make sure the detail panel is open for the task we're transitioning,
    // then poke TaskDetail to reveal its transition form.
    if (taskId !== t.id) handleSelectTask(t);
    setTransitionRequestToken((n) => n + 1);
  }

  useKeyboard(useMemo(() => ({
    'cmd+k': () => setCmdOpen(true),
    'escape': () => { setCmdOpen(false); setFormOpen(false); if (taskId) handleCloseDetail(); },
    'c': () => setFormOpen(true),
    'j': () => moveHighlight(1),
    'k': () => moveHighlight(-1),
    'enter': () => openHighlighted(),
    'x': () => claimToggleHighlighted(),
    's': () => transitionHighlighted(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [taskId, handleCloseDetail, highlightedId, orderedTasks]));

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
            transitionRequestToken={transitionRequestToken}
          />
        ) : undefined}
        onCloseDetail={handleCloseDetail}
      >
        {isLoading ? (
          <div className="flex h-32 items-center justify-center text-sm text-text-muted">Loading...</div>
        ) : (
          <TaskList
            title={title}
            tasks={tasks}
            selectedTaskId={taskId ?? null}
            highlightedTaskId={highlightedId}
            onSelectTask={handleSelectTask}
            principals={principalMap}
            projects={projectMap}
            onOrderChange={setOrderedTasks}
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
      {formOpen && <TaskForm onClose={() => setFormOpen(false)} />}
    </>
  );
}
