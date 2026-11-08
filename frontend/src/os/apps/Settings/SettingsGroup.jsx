/** A Win7 group box: a bordered fieldset with its title in the legend. */
export default function SettingsGroup({ legend, children }) {
  return (
    <fieldset className="border border-[#d6dbe3] p-3 pt-1">
      <legend className="px-1">{legend}</legend>
      {children}
    </fieldset>
  )
}
