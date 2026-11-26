import { act, render, screen } from '@testing-library/react'
import LastSaved, { formatLastSaved } from '../LastSaved'

describe('formatLastSaved', () => {
  const now = new Date(2026, 10, 26, 15, 0)

  test('uses 12-hour time for a save made today', () => {
    expect(formatLastSaved(new Date(2026, 10, 26, 14, 5), now)).toBe('Last saved at 2:05 PM')
    expect(formatLastSaved(new Date(2026, 10, 26, 0, 9), now)).toBe('Last saved at 12:09 AM')
  })

  test('uses the short date for an earlier day', () => {
    expect(formatLastSaved(new Date(2026, 10, 5, 14, 5), now)).toBe('Last saved on Nov 05, 2026')
  })
})

describe('LastSaved', () => {
  afterEach(() => vi.useRealTimers())

  test('renders nothing before a save', () => {
    const { container } = render(<LastSaved savedAt={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('shows the tag, then collapses it after the delay', () => {
    vi.useFakeTimers()
    render(<LastSaved savedAt={new Date()} />)
    const text = screen.getByText('Progress saved')
    const tag = text.parentElement
    expect(tag).not.toHaveClass('collapsed')
    expect(screen.getByText(/Last saved/)).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(tag).toHaveClass('collapsed')
  })

  test('restarts the animation on a new save', () => {
    vi.useFakeTimers()
    const { rerender } = render(<LastSaved savedAt={new Date(2026, 10, 26, 10, 0)} />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    const tag = screen.getByText('Progress saved').parentElement
    expect(tag).toHaveClass('collapsed')

    rerender(<LastSaved savedAt={new Date(2026, 10, 26, 10, 1)} />)
    expect(tag).not.toHaveClass('collapsed')
  })
})
