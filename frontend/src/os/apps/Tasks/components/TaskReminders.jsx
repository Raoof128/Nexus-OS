import { useTaskReminders } from '../hooks/useTaskReminders'

// Desktop-level task reminder service. Renders nothing. Desktop mounts it once while
// the desktop is unlocked, so reminders fire for every list whether or not the
// Tasks window is open. Unmounting (lock, sign-out) clears its timers.
export default function TaskReminders() {
  useTaskReminders()
  return null
}
