export type Result = "" | "draw" | "p1" | "p2";

export type SwissPlayer = {
  byeCount: number;
  displayName: string;
  id: string;
};

export type SwissMatch = {
  confirmedResult: Result;
  player1Id: string;
  player2Id: null | string;
};

export type Standing = SwissPlayer & {
  draws: number;
  losses: number;
  matchPoints: number;
  omw: number;
  wins: number;
};

export type Pairing = {
  player1Id: string;
  player2Id: null | string;
  tableNumber: number;
};

const scoreRows = (players: SwissPlayer[], matches: SwissMatch[]) => {
  const rows = new Map(
    players.map((player) => [
      player.id,
      { ...player, draws: 0, losses: 0, matchPoints: 0, wins: 0 },
    ]),
  );
  const opponents = new Map(players.map((player) => [player.id, [] as string[]]));

  for (const match of matches) {
    if (!match.confirmedResult) continue;
    const first = rows.get(match.player1Id);
    const second = match.player2Id ? rows.get(match.player2Id) : undefined;
    if (!first) continue;
    if (!second) {
      first.wins += 1;
      first.matchPoints += 3;
      continue;
    }
    opponents.get(first.id)?.push(second.id);
    opponents.get(second.id)?.push(first.id);
    if (match.confirmedResult === "draw") {
      first.draws += 1;
      second.draws += 1;
      first.matchPoints += 1;
      second.matchPoints += 1;
    } else {
      const winner = match.confirmedResult === "p1" ? first : second;
      const loser = match.confirmedResult === "p1" ? second : first;
      winner.wins += 1;
      winner.matchPoints += 3;
      loser.losses += 1;
    }
  }
  return { opponents, rows };
};

export const calculateStandings = (players: SwissPlayer[], matches: SwissMatch[]): Standing[] => {
  const { opponents, rows } = scoreRows(players, matches);
  return [...rows.values()]
    .map((row) => {
      const opponentIds = opponents.get(row.id) ?? [];
      const omw =
        opponentIds.length === 0
          ? 0.33
          : opponentIds.reduce((sum, opponentId) => {
              const opponent = rows.get(opponentId);
              if (!opponent) return sum + 0.33;
              const played = opponent.wins + opponent.draws + opponent.losses;
              const percentage = played === 0 ? 0.33 : opponent.matchPoints / (played * 3);
              return sum + Math.max(0.33, percentage);
            }, 0) / opponentIds.length;
      return { ...row, omw };
    })
    .sort(
      (left, right) =>
        right.matchPoints - left.matchPoints ||
        right.omw - left.omw ||
        right.wins - left.wins ||
        left.displayName.localeCompare(right.displayName, "ja"),
    );
};

const pairKey = (left: string, right: string) => [left, right].sort().join(":");

export const createPairings = (
  players: SwissPlayer[],
  previousMatches: SwissMatch[],
): Pairing[] => {
  const standings = calculateStandings(players, previousMatches);
  const scoreById = new Map(standings.map((standing) => [standing.id, standing.matchPoints]));
  const rankById = new Map(standings.map((standing, index) => [standing.id, index]));
  const previousPairs = new Set(
    previousMatches
      .filter((match) => match.player2Id)
      .map((match) => pairKey(match.player1Id, match.player2Id!)),
  );
  const remaining = standings.map((standing) => standing.id);
  let byeId: null | string = null;

  if (remaining.length % 2 === 1) {
    const reversed = [...standings].reverse();
    byeId = (reversed.find((player) => player.byeCount === 0) ?? reversed[0]).id;
    remaining.splice(remaining.indexOf(byeId), 1);
  }

  const search = (ids: string[]): Array<[string, string]> | null => {
    if (ids.length === 0) return [];
    const first = ids[0];
    const candidates = ids.slice(1).sort((left, right) => {
      const leftRematch = previousPairs.has(pairKey(first, left)) ? 1 : 0;
      const rightRematch = previousPairs.has(pairKey(first, right)) ? 1 : 0;
      return (
        leftRematch - rightRematch ||
        Math.abs((scoreById.get(first) ?? 0) - (scoreById.get(left) ?? 0)) -
          Math.abs((scoreById.get(first) ?? 0) - (scoreById.get(right) ?? 0)) ||
        (rankById.get(left) ?? 0) - (rankById.get(right) ?? 0)
      );
    });
    for (const opponent of candidates) {
      const rest = ids.filter((id) => id !== first && id !== opponent);
      const paired = search(rest);
      if (paired) return [[first, opponent], ...paired];
    }
    return null;
  };

  const pairs = search(remaining) ?? [];
  const result: Pairing[] = pairs.map(([player1Id, player2Id], index) => ({
    player1Id,
    player2Id,
    tableNumber: index + 1,
  }));
  if (byeId) {
    result.push({
      player1Id: byeId,
      player2Id: null,
      tableNumber: result.length + 1,
    });
  }
  return result;
};
