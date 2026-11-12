// 注意：本目录下的政策文案为产品上线前草案，正式发布前需经法务审阅。

export interface LegalSection {
  title: string;
  body: React.ReactNode;
}

export function Legal({
  title,
  updated,
  intro,
  sections,
}: {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <div className="wrap page" style={{ maxWidth: 860 }}>
      <div className="kicker">政策</div>
      <h1 className="page-title" style={{ fontSize: 40 }}>
        {title}
      </h1>
      <p className="muted" style={{ fontSize: 14, margin: '8px 0 6px' }}>
        最后更新：{updated}
      </p>
      <p className="muted" style={{ fontSize: 16, margin: '0 0 28px' }}>
        {intro}
      </p>
      <nav
        aria-label="目录"
        style={{ marginBottom: 32, display: 'flex', gap: 10, flexWrap: 'wrap' }}
      >
        {sections.map((s, i) => (
          <a key={s.title} className="link" style={{ fontSize: 13.5 }} href={`#s${i + 1}`}>
            {i + 1}. {s.title}
          </a>
        ))}
      </nav>
      {sections.map((s, i) => (
        <section key={s.title} id={`s${i + 1}`} style={{ marginBottom: 30, scrollMarginTop: 90 }}>
          <h3 style={{ margin: '0 0 10px' }}>
            {i + 1}. {s.title}
          </h3>
          <div
            style={{
              color: 'var(--ink2)',
              fontSize: 15,
              lineHeight: 1.85,
              display: 'grid',
              gap: 10,
            }}
          >
            {s.body}
          </div>
        </section>
      ))}
    </div>
  );
}

export const Ul = ({ items }: { items: React.ReactNode[] }) => (
  <ul style={{ paddingLeft: 20, display: 'grid', gap: 6 }}>
    {items.map((x, i) => (
      <li key={i}>{x}</li>
    ))}
  </ul>
);
