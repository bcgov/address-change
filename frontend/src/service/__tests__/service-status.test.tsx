import { act, render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { AppRoot } from '@/AppRoot'
import { isServiceUnavailableError, markServiceUnavailable } from '@/service/service-status'

describe('isServiceUnavailableError', () => {
  test.each([502, 503, 504])('is true for a %i response', (status) => {
    expect(isServiceUnavailableError({ response: { status } })).toBe(true)
  })

  test('is true when the request got no response', () => {
    expect(isServiceUnavailableError({ request: {} })).toBe(true)
  })

  test.each([
    [{ response: { status: 400 } }],
    [{ response: { status: 500 } }],
    [new Error('setup failure')],
    ['oops'],
    [null],
  ])('is false for %j', (error) => {
    expect(isServiceUnavailableError(error)).toBe(false)
  })
})

describe('AppRoot', () => {
  test('renders children until the service is marked unavailable, then shows the unavailable page', () => {
    render(
      <AppRoot>
        <p>App content</p>
      </AppRoot>,
    )
    expect(screen.getByText('App content')).toBeInTheDocument()

    act(() => markServiceUnavailable())
    expect(screen.queryByText('App content')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Service unavailable' })).toBeInTheDocument()
  })
})
