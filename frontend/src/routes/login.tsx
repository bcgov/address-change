import { createFileRoute, redirect } from '@tanstack/react-router'
import { getValidUser } from '@/auth/auth-service'
import LoginPage from '@/features/auth/LoginPage'

export const Route = createFileRoute('/login')({
  beforeLoad: async () => {
    if (await getValidUser()) {
      throw redirect({ to: '/address-change' })
    }
  },
  component: LoginPage,
})
