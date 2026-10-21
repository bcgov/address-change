import { expect } from '@playwright/test'
import { baseURL } from '../utils'
import type { Page } from 'playwright'

export const dashboard_page = async (page: Page) => {
  await page.goto(baseURL)
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('heading', { level: 2, name: /Sign in/ })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Government of British Columbia' })).toBeVisible()
  await expect(page.getByText('Address Change', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'About gov.bc.ca' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Disclaimer' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Privacy' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Accessibility' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Copyright' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Contact us' })).toBeVisible()
}
