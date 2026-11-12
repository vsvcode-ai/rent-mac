'use client';
import { createContext, useContext } from 'react';
import { useApi } from '@/lib/hooks';
import type { PlansResponse } from '@/lib/types';

export type PlansData = PlansResponse & { allOnline?: boolean };
const Ctx = createContext<PlansData | undefined>(undefined);
export const usePlans = () => useContext(Ctx);

export function PlansProvider({ children }: { children: React.ReactNode }) {
  const { data } = useApi<PlansData>('/plans');
  return <Ctx.Provider value={data}>{children}</Ctx.Provider>;
}
