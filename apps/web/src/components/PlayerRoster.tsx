import type { PlayerState } from "@skribbl-ai/shared";

type PlayerRosterProps = {
  players: PlayerState[];
  drawerPlayerId?: string;
};

export function PlayerRoster({ players, drawerPlayerId }: PlayerRosterProps) {
  return (
    <section className="panel roster-panel">
      <div className="panel-head">
        <h3>Players</h3>
        <span>{players.length} online</span>
      </div>
      <ul className="roster">
        {players.map((player) => (
          <li key={player.id} className={player.id === drawerPlayerId ? "is-drawer" : ""}>
            <span className="roster-avatar">{getInitials(player.name)}</span>
            <div className="roster-copy">
              <strong>{player.name}</strong>
              <span>{player.id === drawerPlayerId ? "Active drawer" : "Guess crew"}</span>
            </div>
            <div className="badge-row">
              {player.isHost ? <span className="badge-chip">Host</span> : null}
              {player.id === drawerPlayerId ? <span className="badge-chip accent">Drawing</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
