import { createFileRoute, redirect } from '@tanstack/react-router'
import { getValidUser } from '@/auth/auth-service'
import HomePage from '@/features/home/HomePage'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    if (await getValidUser()) {
      throw redirect({ to: '/address-change' })
    }
  },
  component: HomePage,
})
