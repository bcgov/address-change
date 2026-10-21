import type { FC } from 'react'
import { Button, Footer, Header } from '@bcgov/design-system-react-components'
import { useAuth } from '@/auth/auth-context'

type Props = {
  children: React.ReactNode
}

const Layout: FC<Props> = ({ children }) => {
  const { isAuthenticated, user, signOut } = useAuth()
  return (
    <div className="d-flex flex-column min-vh-100">
      <Header title="Address Change" titleElement="h1">
        <div className="app-header-actions">
          {isAuthenticated && (
            <>
              <span>{user?.displayName}</span>
              <Button onPress={() => void signOut()} variant="secondary">
                Sign out
              </Button>
            </>
          )}
        </div>
      </Header>
      <main className="app-main" id="main-content">
        {children}
      </main>
      <Footer />
    </div>
  )
}

export default Layout
