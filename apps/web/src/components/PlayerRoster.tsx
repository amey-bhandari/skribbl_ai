import type { GameMode, PlayerState } from "@skribbl-ai/shared";

type PlayerRosterProps = {
  players: PlayerState[];
  gameMode: GameMode;
  drawerPlayerId?: string;
};

export function PlayerRoster({ players, gameMode, drawerPlayerId }: PlayerRosterProps) {
  const orderedPlayers =
    gameMode === "humans_vs_humans"
      ? [...players].sort((left, right) => right.score - left.score || left.joinedAt - right.joinedAt)
      : players;

  return (
    <section className="panel roster-panel">
      <div className="panel-head">
        <h3>Players</h3>
        <span>{players.length} online</span>
      </div>
      <ul className="roster">
        {orderedPlayers.map((player) => (
          <li key={player.id} className={player.id === drawerPlayerId ? "is-drawer" : ""}>
            <span className="roster-avatar">{getInitials(player.name)}</span>
            <div className="roster-copy">
              <strong>{player.name}</strong>
              <span>
                {player.id === drawerPlayerId
                  ? "Active drawer"
                  : gameMode === "humans_vs_humans"
                    ? `${player.score} point${player.score === 1 ? "" : "s"}`
                    : "Guess crew"}
              </span>
            </div>
            <div className="badge-row">
              {player.isHost ? <span className="badge-chip">Host</span> : null}
              {player.id === drawerPlayerId ? <span className="badge-chip accent">Drawing</span> : null}
              {gameMode === "humans_vs_humans" ? <span className="badge-chip score-chip">{player.score}</span> : null}
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
