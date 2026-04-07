import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { CreateApiKeyRequest } from '@mostly/types';
import * as authApi from '@/api/auth';

export function useApiKeys() {
  return useQuery({
    queryKey: ['api-keys'],
    queryFn: () => authApi.listApiKeys(),
    select: (res) => res.data.items,
  });
}

export function useCreateApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateApiKeyRequest) => authApi.createApiKey(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}

export function useRevokeApiKey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => authApi.revokeApiKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });
}
