import { vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthContext, type AuthContextValue } from '@/auth/auth-context'
import AddressChangeForm from '../AddressChangeForm'
import { saveAddressChangeDraft, submitAddressChange } from '../api'

vi.mock('../api', () => ({
  submitAddressChange: vi.fn(),
  saveAddressChangeDraft: vi.fn(),
}))

const auth: AuthContextValue = {
  isLoading: false,
  isAuthenticated: true,
  user: {
    sub: 's',
    displayName: 'Jane Doe',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    birthdate: '1983-10-16',
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

const renderForm = (props = {}) =>
  render(
    <AuthContext value={auth}>
      <AddressChangeForm {...props} />
    </AuthContext>,
  )

const click = (name: string) => userEvent.click(screen.getByRole('button', { name }))

describe('AddressChangeForm step flow', () => {
  beforeEach(() => {
    window.scrollTo = vi.fn()
    vi.mocked(submitAddressChange).mockReset()
    vi.mocked(saveAddressChangeDraft).mockReset().mockResolvedValue({ requestId: 'draft-1' })
  })

  test('continue stays disabled until the collection notice is acknowledged', async () => {
    renderForm()
    expect(screen.getByRole('region', { name: 'Collection notice' })).toBeInTheDocument()
    const next = screen.getByRole('button', { name: 'Continue' })
    expect(next).toBeDisabled()
    await userEvent.click(screen.getByLabelText(/acknowledge the collection notice/))
    expect(next).toBeEnabled()
  })

  test('completed steps in the progress bar navigate back', async () => {
    renderForm({ initialDraft: { idempotencyKey: 'k', step: 2, values: {} } })
    expect(screen.queryByRole('button', { name: /Partner details/ })).not.toBeInTheDocument()
    await click('Collection notice')
    expect(await screen.findByRole('region', { name: 'Collection notice' })).toBeInTheDocument()
  })

  test('shows the review step with name, birthdate, email and address and saves a draft', async () => {
    renderForm()
    await userEvent.click(screen.getByLabelText(/acknowledge the collection notice/))
    await click('Continue')

    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 0 })
    expect(screen.getByText('1983-10-16')).toBeInTheDocument()
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByText(/9 Old Rd, Sooke, BC, V9Z 0A1, Canada/)).toBeInTheDocument()
    expect(saveAddressChangeDraft).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ step: 1 }),
    )

    await click('Back')
    expect(await screen.findByRole('region', { name: 'Collection notice' })).toBeInTheDocument()
  })

  test('disables continue on the address step until required fields are filled', async () => {
    renderForm({ initialDraft: { idempotencyKey: 'k', step: 2, values: {} } })
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(screen.queryByText('Partner details', { selector: 'h3' })).not.toBeInTheDocument()
  })

  test('requires the mailing address when it differs from the residential address', async () => {
    renderForm({
      initialDraft: {
        idempotencyKey: 'k',
        step: 2,
        values: {
          residentialAddress: {
            addressLineOne: '1 Main St',
            locality: 'Victoria',
            postalCode: 'V8V 1A1',
          },
        },
      },
    })
    const next = screen.getByRole('button', { name: 'Continue' })
    await waitFor(() => expect(next).toBeEnabled())

    await userEvent.click(screen.getByLabelText(/mailing address is the same/))
    await waitFor(() => expect(next).toBeDisabled())

    const mailing = within(screen.getByRole('group', { name: 'New mailing address' }))
    await userEvent.type(mailing.getByLabelText(/Address line 1/), '2 Side St')
    await userEvent.type(mailing.getByLabelText(/City/), 'Sooke')
    await userEvent.type(mailing.getByLabelText(/Postal code/), 'V9Z 0A1')
    await waitFor(() => expect(next).toBeEnabled())
  })

  test('walks through every step, then submits and shows the request id', async () => {
    vi.mocked(submitAddressChange).mockResolvedValue({ requestId: 'req-1' })
    const onSubmitted = vi.fn()
    renderForm({ onSubmitted })

    await userEvent.click(screen.getByLabelText(/acknowledge the collection notice/))
    await click('Continue')
    await click('Continue')

    await userEvent.type(await screen.findByLabelText(/Address line 1/), '1 Main St')
    await userEvent.type(screen.getByLabelText(/City/), 'Victoria')
    await userEvent.type(screen.getByLabelText(/Postal code/), 'V8V 1A1')
    const province = screen.getAllByLabelText(/Province/)[0]
    expect(province).toBeDisabled()
    expect(province).toHaveValue('British Columbia')
    await click('Continue')

    expect(await screen.findByRole('radio', { name: 'Yes' })).toBeChecked()
    expect(screen.queryByText(/Medical Services Plan/)).not.toBeInTheDocument()
    expect(screen.queryByText("Usually your mother's maiden name.")).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()

    await userEvent.type(screen.getByLabelText(/Driver’s licence number/), '12-34x567')
    expect(screen.getByLabelText(/Driver’s licence number/)).toHaveValue('1234567')
    await userEvent.type(screen.getByLabelText(/Height/), '1a7.5cm')
    expect(screen.getByLabelText(/Height/)).toHaveValue('175')
    await userEvent.type(screen.getByLabelText(/Weight/), '70')
    await userEvent.type(screen.getByLabelText(/Security keyword/), 'Smith')
    await click('Continue')

    expect(await screen.findByText('1 Main St, Victoria, BC, V8V 1A1, Canada')).toBeInTheDocument()
    await click('Continue')

    expect(await screen.findByText('req-1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Return to home' })).toBeInTheDocument()
    expect(onSubmitted).toHaveBeenCalledWith('req-1')
    const body = vi.mocked(submitAddressChange).mock.calls[0][0]
    expect(body.notificationIntent).toEqual({
      notifyBcsc: true,
      notifyIcbc: true,
      notifyMsp: false,
    })
    expect(body.person).toMatchObject({ driversLicenseNumber: '1234567', heightCm: 175 })
    expect(body.newAddress).toMatchObject({ addressLineOne: '1 Main St', region: 'BC' })
  })

  test('security keyword is masked until shown', async () => {
    renderForm({ initialDraft: { idempotencyKey: 'k', step: 3, values: {} } })
    const keyword = await screen.findByLabelText(/Security keyword/)
    expect(keyword).toHaveAttribute('type', 'password')
    await userEvent.click(screen.getByRole('button', { name: 'Show security keyword' }))
    expect(screen.getByLabelText(/Security keyword/)).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide security keyword' })).toBeInTheDocument()
  })

  test('hides ICBC requirements when ICBC is unchecked', async () => {
    renderForm({ initialDraft: { idempotencyKey: 'k', step: 3, values: {} } })
    expect(await screen.findByLabelText(/Security keyword/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: 'No' }))
    await waitFor(() => expect(screen.queryByLabelText(/Security keyword/)).not.toBeInTheDocument())
  })

  test('Save draft is only offered on steps 2 and 3', async () => {
    renderForm()
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByLabelText(/acknowledge the collection notice/))
    await click('Continue')
    expect(await screen.findByText('Jane Doe')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save draft' })).not.toBeInTheDocument()
  })

  test('Save draft saves only valid fields on the current step, stays put and the notice closes', async () => {
    const onDraftCreated = vi.fn()
    renderForm({
      onDraftCreated,
      initialDraft: {
        idempotencyKey: 'k',
        step: 2,
        values: {
          collectionNoticeAcknowledged: true,
          residentialAddress: {
            addressLineOne: '1 Main St',
            locality: 'Victoria',
            postalCode: 'bad',
          },
        },
      },
    })
    const saveButton = screen.getByRole('button', { name: 'Save draft' })
    expect(saveButton).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/Address line 1/), ' B')
    await waitFor(() => expect(saveButton).toBeEnabled())
    await userEvent.click(saveButton)

    expect(await screen.findByText('Draft saved.')).toBeInTheDocument()
    expect(saveButton).toBeDisabled()
    expect(screen.getByText('New residential address')).toBeInTheDocument()
    expect(onDraftCreated).not.toHaveBeenCalled()
    const [, payload] = vi.mocked(saveAddressChangeDraft).mock.calls[0]
    expect(payload.step).toBe(2)
    expect(payload.values.residentialAddress).toMatchObject({
      addressLineOne: '1 Main St B',
      locality: 'Victoria',
      postalCode: '',
    })

    await userEvent.click(screen.getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByText('Draft saved.')).not.toBeInTheDocument())
  })

  test('Save draft on a new request reports the created draft once', async () => {
    const onDraftCreated = vi.fn()
    renderForm({ onDraftCreated })
    await userEvent.click(screen.getByLabelText(/acknowledge the collection notice/))
    await click('Continue')
    await screen.findByText('Jane Doe')
    expect(onDraftCreated).toHaveBeenCalledTimes(1)
    expect(onDraftCreated).toHaveBeenCalledWith('draft-1')
  })

  test('Save draft shows an error when saving fails', async () => {
    vi.mocked(saveAddressChangeDraft).mockRejectedValue(new Error('down'))
    renderForm({ initialDraft: { idempotencyKey: 'k', step: 2, values: {} } })
    await userEvent.type(screen.getByLabelText(/Address line 1/), '1 Main St')
    await click('Save draft')
    expect(await screen.findByText(/could not save/i)).toBeInTheDocument()
    expect(screen.queryByText('Draft saved.')).not.toBeInTheDocument()
  })

  test('shows an error and stays on the step if saving progress fails', async () => {
    vi.mocked(saveAddressChangeDraft).mockRejectedValue(new Error('down'))
    renderForm()
    await userEvent.click(screen.getByLabelText(/acknowledge the collection notice/))
    await click('Continue')
    expect(await screen.findByText(/could not save your progress/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Collection notice' })).toBeInTheDocument()
  })
})
