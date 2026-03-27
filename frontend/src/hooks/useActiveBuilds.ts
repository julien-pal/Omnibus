import { useQuery } from '@tanstack/react-query';
import { syncService } from '@/api/syncService';

export function useActiveBuilds(): Set<string> {
  const { data } = useQuery<{ builds: string[] }>({
    queryKey: ['active-builds'],
    queryFn: () => syncService.getActiveBuilds().then((r) => r.data),
    refetchInterval: 10000,
    staleTime: 0,
  });
  return new Set(data?.builds ?? []);
}
