export function Hint({ text, hintKey }: { text: string; hintKey: string }) {
  const idx = text.toLowerCase().indexOf(hintKey.toLowerCase());
  if (idx === -1) return <>{text}</>;

  return (
    <span>
      {text.slice(0, idx)}
      <span className="text-muted-foreground">[</span>
      {text[idx]}
      <span className="text-muted-foreground">]</span>
      {text.slice(idx + 1)}
    </span>
  );
}
