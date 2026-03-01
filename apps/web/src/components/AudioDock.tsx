type AudioDockProps = {
  musicEnabled: boolean;
  sfxEnabled: boolean;
  onToggleMusic: () => void;
  onToggleSfx: () => void;
};

export function AudioDock({ musicEnabled, sfxEnabled, onToggleMusic, onToggleSfx }: AudioDockProps) {
  return (
    <aside className="audio-dock" aria-label="Audio controls">
      <button type="button" className={`audio-chip ${musicEnabled ? "is-active" : ""}`} onClick={onToggleMusic}>
        <span className="audio-emoji">🎵</span>
        <span>{musicEnabled ? "Music on" : "Music off"}</span>
      </button>
      <button type="button" className={`audio-chip ${sfxEnabled ? "is-active" : ""}`} onClick={onToggleSfx}>
        <span className="audio-emoji">✨</span>
        <span>{sfxEnabled ? "SFX on" : "SFX off"}</span>
      </button>
    </aside>
  );
}
