import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  ServiceUnavailable,
  formatDuration,
  retryDelaySeconds,
} from '@/components/ServiceUnavailable'

describe('retryDelaySeconds', () => {
  test('backs off exponentially from 45s up to a 180s cap', () => {
    expect([0, 1, 2, 3, 10].map(retryDelaySeconds)).toEqual([45, 90, 180, 180, 180])
  })
})

describe('formatDuration', () => {
  test.each([
    [1, '1 second'],
    [45, '45 seconds'],
    [60, '1 minute'],
    [90, '1 minute 30 seconds'],
    [180, '3 minutes'],
  ])('formats %i seconds', (input, expected) => {
    expect(formatDuration(input)).toBe(expected)
  })
})

// Each second needs its own act so React re-renders and schedules the next timer.
async function tick(seconds: number) {
  for (let i = 0; i < seconds; i++) {
    await act(() => vi.advanceTimersByTimeAsync(1000))
  }
}

describe('ServiceUnavailable', () => {
  const reload = vi.fn()
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.useFakeTimers()
    reload.mockReset()
    fetchMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('location', { ...window.location, reload })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  test('shows the countdown and counts down each second', async () => {
    render(<ServiceUnavailable />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'Service unavailable' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Retrying in 45 seconds (attempt 1)')).toBeInTheDocument()

    await tick(5)
    expect(screen.getByText('Retrying in 40 seconds (attempt 1)')).toBeInTheDocument()
  })

  test('keeps retrying with a longer delay while the backend is down', async () => {
    fetchMock.mockResolvedValue({ ok: false })
    render(<ServiceUnavailable />)

    await tick(45)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
    )
    expect(reload).not.toHaveBeenCalled()
    expect(screen.getByText('Retrying in 1 minute 30 seconds (attempt 2)')).toBeInTheDocument()
  })

  test('treats a network error as a failed check and continues the cycle', async () => {
    fetchMock.mockRejectedValue(new TypeError('network'))
    render(<ServiceUnavailable />)

    await tick(45)
    expect(screen.getByText(/attempt 2/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry now' })).toBeEnabled()
  })

  test('reloads the page once the backend is healthy', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    render(<ServiceUnavailable />)

    await tick(45)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  test('Retry now checks immediately', async () => {
    fetchMock.mockResolvedValue({ ok: true })
    render(<ServiceUnavailable />)

    await act(async () => screen.getByRole('button', { name: 'Retry now' }).click())
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
