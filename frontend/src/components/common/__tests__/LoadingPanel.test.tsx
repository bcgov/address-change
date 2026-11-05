import { render, screen } from '@testing-library/react'
import LoadingPanel from '@/components/common/LoadingPanel'

describe('LoadingPanel', () => {
  test('renders the title and optional description', () => {
    render(<LoadingPanel description="Hold on" title="Loading" />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.getByText('Hold on')).toBeInTheDocument()
  })

  test('omits the description when not provided', () => {
    render(<LoadingPanel title="Loading" />)
    expect(screen.getByRole('status').querySelector('p')).toBeNull()
  })
})
