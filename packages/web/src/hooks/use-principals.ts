import { useQuery } from '@tanstack/react-query';
import * as principalsApi from '@/api/principals';

export function usePrincipals() {
  return useQuery({
    queryKey: ['principals'],
    queryFn: () => principalsApi.listPrincipals({ limit: 100 }),
    select: (res) => res.data.items,
  });
}
