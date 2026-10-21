import '@bcgov/bc-sans/css/BC_Sans.css'
import '@bcgov/design-tokens/css/variables.css'
import { StrictMode } from 'react'
import * as ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter } from '@tanstack/react-router'
import { AuthProvider } from '@/auth/AuthProvider'

// Import bootstrap styles
import '@/scss/styles.scss'
import '@/styles/app.css'

// Import the generated route tree
import { routeTree } from './routeTree.gen'

// Create a new router instance
const router = createRouter({ routeTree })

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
