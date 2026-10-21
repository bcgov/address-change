import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import SelectField from '@/components/common/SelectField'
import { CANADIAN_PROVINCES } from '@/utils/provinces'

function Harness() {
  const { control } = useForm({ defaultValues: { region: 'BC' } })
  return (
    <SelectField
      control={control}
      label="Province"
      name="region"
      options={[...CANADIAN_PROVINCES]}
    />
  )
}

describe('SelectField', () => {
  test('shows the selected option and lists every province', async () => {
    render(<Harness />)
    const trigger = screen.getAllByRole('button')[0]
    expect(trigger).toHaveTextContent('British Columbia')

    await userEvent.click(trigger)
    expect(screen.getAllByRole('option')).toHaveLength(CANADIAN_PROVINCES.length)
  })
})
