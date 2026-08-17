import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import FolderSidebar from './FolderSidebar'

describe('FolderSidebar', () => {
  it('renders the backend account email_address field', () => {
    render(
      <FolderSidebar
        accounts={[
          {
            id: 'account-1',
            provider: 'google',
            email_address: 'owner@example.com',
          },
        ]}
      />,
    )

    expect(screen.getByRole('option', { name: /owner@example.com/ })).not.toBeNull()
  })
})
