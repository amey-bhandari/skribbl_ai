const SIZES = [4, 8, 12, 18];

type BrushSizePickerProps = {
  value: number;
  onChange: (size: number) => void;
  disabled?: boolean;
  layout?: "row" | "column";
};

export function BrushSizePicker({ value, onChange, disabled = false, layout = "row" }: BrushSizePickerProps) {
  return (
    <div className={`tool-card ${layout === "column" ? "tool-card-vertical" : ""}`}>
      <span className="tool-label">Brush</span>
      <div className={`size-row ${layout === "column" ? "size-column" : ""}`}>
        {SIZES.map((size) => (
          <button
            key={size}
            type="button"
            className={`size-chip ${value === size ? "is-active" : ""}`}
            onClick={() => onChange(size)}
            disabled={disabled}
          >
            <span className="size-dot" style={{ width: size, height: size }} />
          </button>
        ))}
      </div>
    </div>
  );
}
