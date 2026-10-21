import { render, screen, within } from '@testing-library/react'
import Layout from '@/components/Layout'

describe('Layout', () => {
  test('exposes one main landmark and a level-one heading, with no home button', () => {
    render(
      <Layout>
        <p>Page content</p>
      </Layout>,
    )

    expect(screen.getAllByRole('main')).toHaveLength(1)
    expect(screen.getByRole('main')).toContainElement(screen.getByText('Page content'))
    expect(screen.getByRole('heading', { level: 1, name: 'Address Change' })).toBeInTheDocument()

    const header = screen.getByRole('banner')
    expect(within(header).queryByRole('link', { name: 'Requests' })).not.toBeInTheDocument()
    expect(within(header).queryByRole('button')).not.toBeInTheDocument()
    expect(
      within(header).getByRole('link', { name: 'Government of British Columbia' }),
    ).toBeInTheDocument()
  })
})
