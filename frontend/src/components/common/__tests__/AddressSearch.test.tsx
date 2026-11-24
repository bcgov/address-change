import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'
import AddressSearch from '@/components/common/AddressSearch'
import { searchAddresses } from '@/service/geocoder'

vi.mock('@/service/geocoder', () => ({ searchAddresses: vi.fn() }))

const suggestion = {
  label: '123 Main St, Victoria, BC',
  addressLineOne: '123 Main St',
  locality: 'Victoria',
  region: 'BC',
  country: 'CA',
}

const type = async (value: string) => {
  fireEvent.change(screen.getByRole('searchbox'), { target: { value } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
}

describe('AddressSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.mocked(searchAddresses).mockReset()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  test('does not search for short queries', async () => {
    render(<AddressSearch onSelect={vi.fn()} />)
    await type('12')
    expect(searchAddresses).not.toHaveBeenCalled()
  })

  test('reports the selected suggestion and clears the list', async () => {
    vi.mocked(searchAddresses).mockResolvedValue([suggestion])
    const onSelect = vi.fn()
    render(<AddressSearch onSelect={onSelect} />)
    await type('123 Main')

    fireEvent.click(screen.getByRole('button', { name: suggestion.label }))
    expect(onSelect).toHaveBeenCalledWith(suggestion)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  test('shows a message when nothing matches', async () => {
    vi.mocked(searchAddresses).mockResolvedValue([])
    render(<AddressSearch onSelect={vi.fn()} />)
    await type('nowhere')
    expect(screen.getByText(/No matching addresses found/)).toBeInTheDocument()
  })

  test('shows an error message when the lookup fails', async () => {
    vi.mocked(searchAddresses).mockRejectedValue(new Error('boom'))
    render(<AddressSearch onSelect={vi.fn()} />)
    await type('123 Main')
    expect(screen.getByText(/Address search is unavailable/)).toBeInTheDocument()
  })

  test('ignores aborted lookups', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    vi.mocked(searchAddresses).mockRejectedValue(abort)
    render(<AddressSearch onSelect={vi.fn()} />)
    await type('123 Main')
    expect(screen.queryByText(/Address search is unavailable/)).not.toBeInTheDocument()
  })
})
