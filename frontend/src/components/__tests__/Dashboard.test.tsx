import { render, screen } from '@testing-library/react'
import Dashboard from '@/components/Dashboard'

describe('Dashboard', () => {
  test('renders the application landing page', () => {
    render(<Dashboard />)
    expect(screen.getByRole('heading', { level: 2, name: 'Address change' })).toBeInTheDocument()
    expect(screen.getByText('Address change services are coming soon.')).toBeInTheDocument()
  })
})
