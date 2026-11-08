import { useState } from 'react'
import {
  ACCENT_PRESETS,
  WALLPAPER_POSITIONS,
  WALLPAPER_PRESETS,
  useSettingsStore,
} from '../../stores/settingsStore'
import SettingsGroup from './SettingsGroup'
import { UI_SCALES } from './constants'

function WindowColorGroup() {
  const accentColor = useSettingsStore((s) => s.accentColor)
  const colorIntensity = useSettingsStore((s) => s.colorIntensity)
  const transparencyEnabled = useSettingsStore((s) => s.transparencyEnabled)
  const setAccentColor = useSettingsStore((s) => s.setAccentColor)
  const setColorIntensity = useSettingsStore((s) => s.setColorIntensity)
  const setTransparencyEnabled = useSettingsStore((s) => s.setTransparencyEnabled)

  return (
    <SettingsGroup legend="Window color">
      <div className="flex flex-wrap gap-3 pt-2">
        {Object.entries(ACCENT_PRESETS).map(([key, preset]) => {
          const isActive = accentColor === key
          return (
            <div key={key} className="flex w-[60px] flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => setAccentColor(key)}
                aria-pressed={isActive}
                title={preset.label}
                aria-label={preset.label}
                className={`h-10 w-[52px] rounded-[3px] border border-[#00000040] ${
                  isActive ? 'outline outline-2 outline-offset-1 outline-[#3399ff]' : ''
                }`}
                style={{
                  background: `linear-gradient(#ffffff80, #fff0 50%), ${preset.frame}`,
                }}
              />
              <span className="text-center text-[12px]">{preset.label}</span>
            </div>
          )
        })}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="window-transparency"
            checked={transparencyEnabled}
            onChange={(e) => setTransparencyEnabled(e.target.checked)}
          />
          <label htmlFor="window-transparency">Enable transparency</label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="window-color-intensity" className="shrink-0">
            Color intensity
          </label>
          <input
            type="range"
            id="window-color-intensity"
            min={0}
            max={100}
            step={1}
            value={colorIntensity}
            onChange={(e) => setColorIntensity(Number(e.target.value))}
            className="w-[180px] max-w-full"
          />
          <output htmlFor="window-color-intensity" className="w-[4ch] text-right">
            {colorIntensity}%
          </output>
        </div>
      </div>
    </SettingsGroup>
  )
}

/**
 * Desktop Background stages changes like Windows 7: picking a picture or a
 * position only changes the draft, and Save changes applies both.
 */
function DesktopBackgroundGroup() {
  const wallpaper = useSettingsStore((s) => s.wallpaper)
  const wallpaperPosition = useSettingsStore((s) => s.wallpaperPosition)
  const setWallpaper = useSettingsStore((s) => s.setWallpaper)
  const setWallpaperPosition = useSettingsStore((s) => s.setWallpaperPosition)

  const [draftWallpaper, setDraftWallpaper] = useState(wallpaper)
  const [draftPosition, setDraftPosition] = useState(wallpaperPosition)
  // Last stored values the draft was taken from. If the store changes under us
  // (another tab, another control), the draft follows it instead of going stale.
  const [synced, setSynced] = useState({ wallpaper, position: wallpaperPosition })
  if (synced.wallpaper !== wallpaper || synced.position !== wallpaperPosition) {
    setSynced({ wallpaper, position: wallpaperPosition })
    setDraftWallpaper(wallpaper)
    setDraftPosition(wallpaperPosition)
  }
  const dirty = draftWallpaper !== wallpaper || draftPosition !== wallpaperPosition

  const save = () => {
    setWallpaper(draftWallpaper)
    setWallpaperPosition(draftPosition)
  }

  const cancel = () => {
    setDraftWallpaper(wallpaper)
    setDraftPosition(wallpaperPosition)
  }

  return (
    <SettingsGroup legend="Desktop background">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(132px,132px))] gap-2 pt-2">
        {Object.entries(WALLPAPER_PRESETS).map(([key, preset]) => {
          const isSelected = draftWallpaper === key
          return (
            <button
              key={key}
              type="button"
              onClick={() => setDraftWallpaper(key)}
              aria-pressed={isSelected}
              aria-label={preset.label}
              className={`w7-item flex flex-col items-center gap-1 p-1 text-[12px] ${
                isSelected ? 'is-selected' : ''
              }`}
            >
              <img
                src={preset.image}
                alt=""
                width={120}
                height={75}
                loading="lazy"
                className="h-[75px] w-[120px] max-w-full border border-[#828790] object-cover"
              />
              <span className="w-full truncate text-center">{preset.label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="wallpaper-position" className="shrink-0">
          Picture position
        </label>
        <select
          id="wallpaper-position"
          value={draftPosition}
          onChange={(e) => setDraftPosition(e.target.value)}
        >
          {Object.entries(WALLPAPER_POSITIONS).map(([key, layout]) => (
            <option key={key} value={key}>
              {layout.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={save} disabled={!dirty} className="w7-btn default">
          Save changes
        </button>
        <button type="button" onClick={cancel} disabled={!dirty} className="w7-btn">
          Cancel
        </button>
      </div>
    </SettingsGroup>
  )
}

function DisplaySizeGroup() {
  const uiScale = useSettingsStore((s) => s.uiScale)
  const setUiScale = useSettingsStore((s) => s.setUiScale)

  return (
    <SettingsGroup legend="Display size">
      <div className="flex flex-col gap-2 pt-2">
        {UI_SCALES.map((scale) => {
          const id = `ui-scale-${scale.id}`
          return (
            <div key={scale.id} className="flex items-center gap-2">
              <input
                type="radio"
                id={id}
                name="uiScale"
                value={scale.id}
                checked={uiScale === scale.id}
                onChange={() => setUiScale(scale.id)}
              />
              <label htmlFor={id}>{scale.label}</label>
            </div>
          )
        })}
      </div>
    </SettingsGroup>
  )
}

export default function PersonalizationPanel() {
  return (
    <div className="flex flex-col gap-4">
      <WindowColorGroup />
      <DesktopBackgroundGroup />
      <DisplaySizeGroup />
    </div>
  )
}
