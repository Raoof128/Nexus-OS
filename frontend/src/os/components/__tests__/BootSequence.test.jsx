import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import BootSequence from '../BootSequence'

describe('BootSequence (Welcome screen)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the Welcome text and no longer says Starting Nexus OS', () => {
    render(<BootSequence onComplete={vi.fn()} />)
    expect(screen.getByText('Welcome')).toBeTruthy()
    expect(screen.queryByText(/Starting Nexus OS/)).toBeNull()
  })

  it('completes after the hold and fade timings', () => {
    const onComplete = vi.fn()
    render(<BootSequence onComplete={onComplete} />)
    expect(onComplete).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2300)
    })
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('skips straight to completion for reduced motion', () => {
    window.matchMedia = vi
      .fn()
      .mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })
    const onComplete = vi.fn()
    render(<BootSequence onComplete={onComplete} />)
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('Welcome')).toBeNull()
  })
})
