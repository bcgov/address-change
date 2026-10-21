import { useEffect, useId, useState } from 'react'
import type { FC } from 'react'
import { TextField } from '@bcgov/design-system-react-components'
import { searchAddresses, type AddressSuggestion } from '@/service/geocoder'

const MIN_QUERY_LENGTH = 3
const DEBOUNCE_MS = 300

type Props = {
  label?: string
  description?: string
  onSelect: (suggestion: AddressSuggestion) => void
}

/** Debounced BC address lookup. Selecting a suggestion reports it; fields stay editable. */
const AddressSearch: FC<Props> = ({
  label = 'Search for a BC address',
  description = 'Start typing a street address, then choose a match to fill in the fields below.',
  onSelect,
}) => {
  const listId = useId()
  const [query, setQuery] = useState('')
  const active = query.trim().length >= MIN_QUERY_LENGTH
  const [results, setResults] = useState<AddressSuggestion[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY_LENGTH) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      setStatus('loading')
      searchAddresses(trimmed, controller.signal)
        .then((suggestions) => {
          setResults(suggestions)
          setStatus('idle')
        })
        .catch((error: unknown) => {
          if ((error as Error).name === 'AbortError') return
          setResults([])
          setStatus('error')
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const choose = (suggestion: AddressSuggestion) => {
    onSelect(suggestion)
    setQuery('')
    setResults([])
  }

  return (
    <div className="address-search">
      <TextField
        autoComplete="off"
        description={description}
        label={label}
        onChange={setQuery}
        type="search"
        value={query}
      />
      <div aria-live="polite" className="address-search-status">
        {active && status === 'loading' && 'Searching…'}
        {active &&
          status === 'error' &&
          'Address search is unavailable. Enter the address manually below.'}
        {active &&
          status === 'idle' &&
          results.length === 0 &&
          'No matching addresses found. Enter the address manually below.'}
      </div>
      {active && results.length > 0 && (
        <ul aria-label="Address suggestions" className="address-search-results" id={listId}>
          {results.map((suggestion) => (
            <li key={suggestion.label}>
              <button onClick={() => choose(suggestion)} type="button">
                {suggestion.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default AddressSearch
