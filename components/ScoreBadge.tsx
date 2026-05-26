interface Props {
  score: number;
  votes?: number;
  size?: 'sm' | 'lg';
}

function scoreColor(score: number): string {
  if (score >= 8) return 'bg-green-500';
  if (score >= 7) return 'bg-lime-500';
  if (score >= 6) return 'bg-yellow-500';
  if (score >= 5) return 'bg-orange-500';
  return 'bg-red-500';
}

export default function ScoreBadge({ score, votes, size = 'sm' }: Props) {
  if (!score || score === 0) {
    return (
      <span className="text-xs bg-zinc-700 text-zinc-400 rounded px-1.5 py-0.5">
        NR
      </span>
    );
  }

  return (
    <span
      className={`${scoreColor(score)} text-black font-bold rounded ${
        size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-lg px-2.5 py-1'
      }`}
      title={votes ? `${votes.toLocaleString()} votes` : undefined}
    >
      {score.toFixed(1)}
    </span>
  );
}
