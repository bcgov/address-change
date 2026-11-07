import type { ReactNode } from 'react'
import { ServiceUnavailable } from '@/components/ServiceUnavailable'
import { useServiceUnavailable } from '@/service/service-status'

export function AppRoot({ children }: { children: ReactNode }) {
  return useServiceUnavailable() ? <ServiceUnavailable /> : <>{children}</>
}
