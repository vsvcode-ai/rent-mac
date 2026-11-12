'use client';
import { useState } from 'react';
import { api } from '@/lib/api';

export default function ConsultPage() {
  const [contact, setContact] = useState('');
  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState('');
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = quantity.trim() === '' ? undefined : Number(quantity);
    const b = {
      contact: contact.trim().length < 2,
      quantity: q !== undefined && (!Number.isInteger(q) || q < 1 || q > 1000),
      message: message.trim().length < 5,
    };
    setBad(b);
    setErr('');
    if (b.contact || b.quantity || b.message) return;
    setBusy(true);
    try {
      await api('/consult', {
        body: { contact: contact.trim(), quantity: q, message: message.trim() },
      });
      setDone(true);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="wrap page" style={{ maxWidth: 640 }}>
        <div className="panel" style={{ textAlign: 'center', padding: 44 }}>
          <h1 className="page-title" style={{ fontSize: 28 }}>
            已收到你的咨询
          </h1>
          <p className="muted" style={{ margin: '12px 0 0' }}>
            我们会通过你留下的联系方式尽快回复，通常在一个工作日内。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap page" style={{ maxWidth: 640 }}>
      <div className="kicker">咨询</div>
      <h1 className="page-title" style={{ fontSize: 40 }}>
        多台租用与其他配置
      </h1>
      <p className="muted" style={{ fontSize: 16, margin: '8px 0 28px' }}>
        单笔订单最多 10 台。需要更多台数、其他机型或企业场景，请留下需求，我们会单独报价。
      </p>
      <form className="panel" onSubmit={submit} noValidate>
        <div className={`field${bad.contact ? ' bad' : ''}`}>
          <label htmlFor="contact">联系方式</label>
          <input
            id="contact"
            className={`input${bad.contact ? ' err' : ''}`}
            placeholder="微信号、Telegram 或邮箱"
            maxLength={100}
            value={contact}
            onChange={(e) => setContact(e.target.value)}
          />
          <div className="errmsg">请留下可联系到你的方式</div>
        </div>
        <div className={`field${bad.quantity ? ' bad' : ''}`}>
          <label htmlFor="qty">
            需要的台数<small>选填</small>
          </label>
          <input
            id="qty"
            className={`input${bad.quantity ? ' err' : ''}`}
            inputMode="numeric"
            placeholder="例如 20"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
          />
          <div className="errmsg">请输入 1–1000 的整数</div>
        </div>
        <div className={`field${bad.message ? ' bad' : ''}`}>
          <label htmlFor="msg">你的需求</label>
          <textarea
            id="msg"
            className={`input${bad.message ? ' err' : ''}`}
            rows={5}
            maxLength={1000}
            placeholder="用途、期望的配置、租期、预算等"
            style={{ height: 'auto', padding: 12, resize: 'vertical' }}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <div className="errmsg">请至少写几个字说明需求</div>
        </div>
        {err && (
          <div className="alert danger" role="alert" style={{ marginBottom: 14 }}>
            <span>!</span>
            <div>{err}</div>
          </div>
        )}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? '提交中…' : '提交咨询'}
        </button>
      </form>
    </div>
  );
}
