import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { TaskListParams, CreateTaskRequest, PatchTaskRequest, TransitionTaskRequest, CreateTaskUpdateRequest } from '@mostly/types';
import * as tasksApi from '@/api/tasks';
import { useConfig } from './use-config';

export function useTaskList(params: Partial<TaskListParams> = {}) {
  return useQuery({
    queryKey: ['tasks', params],
    queryFn: () => tasksApi.listTasks(params),
    select: (res) => res.data,
  });
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: ['tasks', id],
    queryFn: () => tasksApi.getTask(id!),
    enabled: !!id,
    select: (res) => res.data,
  });
}

export function useTaskUpdates(taskId: string | null) {
  return useQuery({
    queryKey: ['tasks', taskId, 'updates'],
    queryFn: () => tasksApi.listTaskUpdates(taskId!),
    enabled: !!taskId,
    select: (res) => res.data,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: (data: Omit<CreateTaskRequest, 'actor_handle'>) =>
      tasksApi.createTask({ ...data, actor_handle: config!.principalHandle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

export function useEditTask() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: ({ id, ...data }: Omit<PatchTaskRequest, 'actor_handle'> & { id: string }) =>
      tasksApi.editTask(id, { ...data, actor_handle: config!.principalHandle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

export function useTransitionTask() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: ({ id, ...data }: Omit<TransitionTaskRequest, 'actor_handle'> & { id: string }) =>
      tasksApi.transitionTask(id, { ...data, actor_handle: config!.principalHandle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

export function useClaimTask() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: ({ id, expected_version }: { id: string; expected_version: number }) =>
      tasksApi.claimTask(id, { expected_version, actor_handle: config!.principalHandle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

export function useReleaseTask() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: ({ id, expected_version }: { id: string; expected_version: number }) =>
      tasksApi.releaseTask(id, { expected_version, actor_handle: config!.principalHandle }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); },
  });
}

export function useAddTaskUpdate() {
  const qc = useQueryClient();
  const { config } = useConfig();
  return useMutation({
    mutationFn: ({ taskId, ...data }: Omit<CreateTaskUpdateRequest, 'actor_handle'> & { taskId: string }) =>
      tasksApi.addTaskUpdate(taskId, { ...data, actor_handle: config!.principalHandle }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['tasks', vars.taskId, 'updates'] });
    },
  });
}
