import { useCallback, useEffect, useState } from 'react'
import { Button, Footer, Header } from '@bcgov/design-system-react-components'

const BASE_DELAY_SECONDS = 45
const MAX_DELAY_SECONDS = 180

export function retryDelaySeconds(attempt: number): number {
  return Math.min(BASE_DELAY_SECONDS * 2 ** attempt, MAX_DELAY_SECONDS)
}

export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (minutes === 0) return plural(seconds, 'second')
  if (seconds === 0) return plural(minutes, 'minute')
  return `${plural(minutes, 'minute')} ${plural(seconds, 'second')}`
}

const HEALTH_CHECK_TIMEOUT_MS = 10_000

async function backendIsUp(): Promise<boolean> {
  try {
    const response = await fetch('/api/health', {
      cache: 'no-store',
      signal: AbortSignal.timeout(HEALTH_CHECK_TIMEOUT_MS),
    })
    return response.ok
  } catch {
    return false
  }
}

export function ServiceUnavailable() {
  const [attempt, setAttempt] = useState(0)
  const [secondsLeft, setSecondsLeft] = useState(retryDelaySeconds(0))
  const [checking, setChecking] = useState(false)

  const check = useCallback(async (currentAttempt: number) => {
    setChecking(true)
    if (await backendIsUp()) {
      window.location.reload()
      return
    }
    const next = currentAttempt + 1
    setAttempt(next)
    setSecondsLeft(retryDelaySeconds(next))
    setChecking(false)
  }, [])

  useEffect(() => {
    if (checking) return
    if (secondsLeft <= 0) {
      void check(attempt)
      return
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [secondsLeft, checking, attempt, check])

  const total = retryDelaySeconds(attempt)
  const progress = checking ? 100 : ((total - secondsLeft) / total) * 100

  return (
    <div className="d-flex flex-column min-vh-100 service-unavailable-page">
      <Header title="Address Change" titleElement="p" />
      <main className="app-main" id="main-content">
        <section className="service-unavailable" role="alert">
          <svg
            aria-hidden="true"
            className="service-unavailable-illustration"
            viewBox="0 0 200 140"
          >
            <path
              d="M60 110H140a26 26 0 0 0 4-51.7A40 40 0 0 0 66 52a29 29 0 0 0-6 58z"
              fill="#f1f8fe"
              stroke="#013366"
              strokeLinejoin="round"
              strokeWidth="6"
            />
            <path d="M48 22L152 126" stroke="#fff" strokeLinecap="round" strokeWidth="20" />
            <path d="M48 22L152 126" stroke="#fcba19" strokeLinecap="round" strokeWidth="9" />
          </svg>
          <h1>Service unavailable</h1>
          <p>
            The Address Change service is temporarily unavailable. Any saved drafts are safe. We
            will reconnect automatically when the service is back.
          </p>
          <div
            aria-label="Time until next retry"
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={Math.round(progress)}
            className="service-unavailable-progress"
            role="progressbar"
          >
            <div className="service-unavailable-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <p aria-live="polite" className="service-unavailable-status">
            {checking
              ? 'Checking service status…'
              : `Retrying in ${formatDuration(secondsLeft)} (attempt ${attempt + 1})`}
          </p>
          <Button isDisabled={checking} onPress={() => setSecondsLeft(0)} variant="primary">
            Retry now
          </Button>
        </section>
      </main>
      <Footer />
    </div>
  )
}
