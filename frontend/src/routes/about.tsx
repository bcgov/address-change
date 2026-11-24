import { createFileRoute } from '@tanstack/react-router'
import AboutPage from '@/features/home/AboutPage'

export const Route = createFileRoute('/about')({
  component: AboutPage,
})
