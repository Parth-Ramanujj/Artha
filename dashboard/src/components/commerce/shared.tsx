export function Stat({ label: name, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{name}</span>
      <div style={{ fontSize: 22, fontWeight: 700, marginTop: 4, color }}>{value}</div>
    </div>
  );
}
