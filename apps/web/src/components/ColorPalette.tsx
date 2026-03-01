const COLORS = ["#122620", "#e94f37", "#f6bd60", "#4d9078", "#4062bb", "#7d5ba6"];

type ColorPaletteProps = {
  value: string;
  onChange: (color: string) => void;
  onClear: () => void;
  disabled?: boolean;
  layout?: "row" | "column";
};

export function ColorPalette({ value, onChange, onClear, disabled = false, layout = "row" }: ColorPaletteProps) {
  return (
    <div className={`tool-card ${layout === "column" ? "tool-card-vertical" : ""}`}>
      <span className="tool-label">Ink</span>
      <div className={`swatch-row ${layout === "column" ? "swatch-column" : ""}`}>
        {COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`swatch ${value === color ? "is-active" : ""}`}
            style={{ backgroundColor: color }}
            onClick={() => onChange(color)}
            disabled={disabled}
            aria-label={`Use ${color} ink`}
          />
        ))}
        <button
          type="button"
          className="tool-toggle"
          onClick={onClear}
          disabled={disabled}
          aria-label="Clear canvas"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
