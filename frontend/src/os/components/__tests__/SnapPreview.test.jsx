import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import SnapPreview from '../SnapPreview'

// Stacking scale from Desktop.jsx and Taskbar.jsx: a window sits at 100 + its stack
// index, the taskbar at 500 and the Start menu at 599+.
const WINDOW_Z_BASE = 100
const TASKBAR_Z = 500

describe('SnapPreview', () => {
  it('draws above a window stack of realistic depth', () => {
    const { container } = render(<SnapPreview hint="left" />)
    const preview = container.querySelector('.nx-snap-preview')
    expect(preview).not.toBeNull()
    const z = Number(preview.style.zIndex)
    expect(z).toBeGreaterThan(WINDOW_Z_BASE + 50)
  })

  it('stays below the taskbar and the menus', () => {
    const { container } = render(<SnapPreview hint="right" />)
    const z = Number(container.querySelector('.nx-snap-preview').style.zIndex)
    expect(z).toBeLessThan(TASKBAR_Z)
  })

  it('covers the half or full work area named by the hint', () => {
    const { container } = render(<SnapPreview hint="left" />)
    expect(container.querySelector('.nx-snap-preview').style.width).toBe('50%')
  })

  it('covers the whole work area for a top snap (maximise)', () => {
    const { container } = render(<SnapPreview hint="top" />)
    expect(container.querySelector('.nx-snap-preview').style.width).toBe('100%')
  })

  it('renders nothing without a hint', () => {
    const { container } = render(<SnapPreview hint={null} />)
    expect(container.querySelector('.nx-snap-preview')).toBeNull()
  })
})
