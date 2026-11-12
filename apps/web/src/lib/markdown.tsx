import { Fragment, type ReactNode } from 'react';

/**
 * 很小的 Markdown 渲染：标题、段落、列表、引用、代码块、链接、粗体、行内代码。
 * 直接生成 React 元素而不是拼 HTML 字符串，文本由 React 转义，链接只放行 http(s)、站内路径、锚点和 mailto，
 * 所以文章内容里的 <script>、onerror= 之类都不会被执行。
 */

export interface PostMeta {
  slug: string;
  title: string;
  date: string;
  description: string;
}

export function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0)
      meta[line.slice(0, i).trim()] = line
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
  }
  return { meta, body: m[2]! };
}

export const safeHref = (url: string): string | null => {
  const u = url.trim();
  if (
    /^(https?:\/\/|mailto:)/i.test(u) ||
    (u.startsWith('/') && !u.startsWith('//')) ||
    u.startsWith('#')
  )
    return u;
  return null;
};

function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  // 依次匹配：行内代码、链接、粗体
  const re = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let n = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${n++}`;
    if (m[1] !== undefined) out.push(<code key={k}>{m[1]}</code>);
    else if (m[2] !== undefined) {
      const href = safeHref(m[3]!);
      out.push(
        href ? (
          <a
            key={k}
            href={href}
            {...(/^https?:/i.test(href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {m[2]}
          </a>
        ) : (
          <Fragment key={k}>{m[2]}</Fragment>
        ),
      );
    } else out.push(<strong key={k}>{m[4]}</strong>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function renderMarkdown(src: string): ReactNode[] {
  const lines = src.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }
    const fence = /^```(\w*)\s*$/.exec(line);
    if (fence) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i]!)) buf.push(lines[i++]!);
      i++;
      out.push(
        <pre key={k++}>
          <code>{buf.join('\n')}</code>
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,3})\s+(.+)$/.exec(line);
    if (h) {
      const level = h[1]!.length;
      const Tag = `h${level + 1}` as 'h2' | 'h3' | 'h4'; // 文章标题由页面渲染为 h1，正文 # 从 h2 起
      out.push(<Tag key={k++}>{inline(h[2]!, `h${k}`)}</Tag>);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i]!))
        buf.push(lines[i++]!.replace(/^>\s?/, ''));
      out.push(<blockquote key={k++}>{inline(buf.join(' '), `q${k}`)}</blockquote>);
      continue;
    }
    const ul = /^\s*[-*]\s+/.test(line);
    const ol = /^\s*\d+\.\s+/.test(line);
    if (ul || ol) {
      const items: string[] = [];
      const first = line;
      const re = ul ? /^\s*[-*]\s+(.*)$/ : /^\s*\d+\.\s+(.*)$/;
      while (i < lines.length && re.test(lines[i]!)) items.push(re.exec(lines[i++]!)![1]!);
      const kids = items.map((t, j) => <li key={j}>{inline(t, `li${k}-${j}`)}</li>);
      if (ul) out.push(<ul key={k++}>{kids}</ul>);
      else {
        // 有序列表被代码块打断后，下一段列表要接着上一段的编号
        const start = Number(/^\s*(\d+)\./.exec(first)![1]);
        out.push(
          <ol key={k++} start={start}>
            {kids}
          </ol>,
        );
      }
      continue;
    }
    const buf: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() &&
      !/^(```|#{1,3}\s|>\s?|\s*[-*]\s+|\s*\d+\.\s+)/.test(lines[i]!)
    ) {
      buf.push(lines[i++]!);
    }
    out.push(<p key={k++}>{inline(buf.join(' '), `p${k}`)}</p>);
  }
  return out;
}
