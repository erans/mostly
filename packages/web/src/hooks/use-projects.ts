import { useQuery } from '@tanstack/react-query';
import * as projectsApi from '@/api/projects';

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.listProjects({ limit: 100 }),
    select: (res) => res.data.items,
  });
}

export function useProject(id: string | null) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: () => projectsApi.getProject(id!),
    enabled: !!id,
    select: (res) => res.data,
  });
}
