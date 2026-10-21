import { vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthContext, type AuthContextValue } from '@/auth/auth-context'
import AddressChangeForm from '../AddressChangeForm'
import { submitAddressChange } from '../api'

vi.mock('../api', () => ({ submitAddressChange: vi.fn() }))

const auth: AuthContextValue = {
  isLoading: false,
  isAuthenticated: true,
  user: {
    sub: 's',
    displayName: 'Jane Doe',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    birthdate: '',
    currentAddress: {
      addressLineOne: '9 Old Rd',
      addressLineTwo: '',
      locality: 'Sooke',
      region: 'BC',
      postalCode: 'V9Z 0A1',
      country: 'Canada',
    },
  },
  signIn: async () => undefined,
  signOut: async () => undefined,
  getAccessToken: async () => 'token',
}

const renderForm = (onSubmitted = vi.fn()) =>
  render(
    <AuthContext value={auth}>
      <AddressChangeForm onSubmitted={onSubmitted} />
    </AuthContext>,
  )

describe('AddressChangeForm', () => {
  beforeEach(() => vi.mocked(submitAddressChange).mockReset())

  test('shows the display name and current address from the token', () => {
    renderForm()
    expect(screen.getByText('Jane Doe')).toBeInTheDocument()
    expect(screen.getByText(/9 Old Rd, Sooke, BC, V9Z 0A1, Canada/)).toBeInTheDocument()
  })

  test('formats and validates the postal code as the user types', async () => {
    renderForm()
    const input = screen.getAllByLabelText(/Postal code/)[0]

    await userEvent.type(input, 'v8v1')
    expect(input).toHaveValue('V8V 1')
    expect(await screen.findByText('Enter a valid postal code, like V8V 1A1')).toBeInTheDocument()

    await userEvent.type(input, 'a1')
    expect(input).toHaveValue('V8V 1A1')
    await waitFor(() =>
      expect(screen.queryByText('Enter a valid postal code, like V8V 1A1')).not.toBeInTheDocument(),
    )
  })

  test('shows validation errors and does not submit an empty form', async () => {
    renderForm()
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }))
    expect(await screen.findAllByText('Enter address line 1')).not.toHaveLength(0)
    expect(submitAddressChange).not.toHaveBeenCalled()
  })

  test('uses the birthdate from the token instead of asking for it', async () => {
    vi.mocked(submitAddressChange).mockResolvedValue({ requestId: 'req-2' })
    const onSubmitted = vi.fn()
    render(
      <AuthContext value={{ ...auth, user: { ...auth.user!, birthdate: '1983-10-16' } }}>
        <AddressChangeForm onSubmitted={onSubmitted} />
      </AuthContext>,
    )
    expect(screen.queryByLabelText(/Date of birth/)).not.toBeInTheDocument()
    expect(screen.getByText('1983-10-16')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/Address line 1/), '1 Main St')
    await userEvent.type(screen.getByLabelText(/City/), 'Victoria')
    await userEvent.type(screen.getByLabelText(/Postal code/), 'V8V 1A1')
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }))

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith('req-2'))
    expect(vi.mocked(submitAddressChange).mock.calls[0][0].person.dateOfBirth).toBe('1983-10-16')
  })

  test('submits a valid form once and reports the request id', async () => {
    vi.mocked(submitAddressChange).mockResolvedValue({ requestId: 'req-1' })
    const onSubmitted = vi.fn()
    renderForm(onSubmitted)

    await userEvent.type(screen.getByLabelText(/Date of birth/), '1990-01-02')
    await userEvent.type(screen.getByLabelText(/Address line 1/), '1 Main St')
    await userEvent.type(screen.getByLabelText(/City/), 'Victoria')
    await userEvent.type(screen.getByLabelText(/Postal code/), 'V8V 1A1')
    await userEvent.click(screen.getByRole('button', { name: 'Submit request' }))

    await waitFor(() => expect(onSubmitted).toHaveBeenCalledWith('req-1'))
    expect(submitAddressChange).toHaveBeenCalledTimes(1)
    expect(vi.mocked(submitAddressChange).mock.calls[0][0]).toMatchObject({
      oldAddress: { addressLineOne: '9 Old Rd' },
      newAddress: { addressLineOne: '1 Main St', locality: 'Victoria' },
      isBillingAddressSame: true,
    })
  })
})
