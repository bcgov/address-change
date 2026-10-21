import { createFileRoute, redirect } from '@tanstack/react-router'
import { getValidUser } from '@/auth/auth-service'

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async () => {
    if (!(await getValidUser())) {
      throw redirect({ to: '/login' })
    }
  },
})
