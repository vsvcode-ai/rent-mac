'use client';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { BrandMark } from '@/components/Brand';
import { useCopy } from '@/components/Toast';
import { errText } from '@/components/admin/kit';
import { api } from '@/lib/api';

type Step = 'password' | 'setup' | 'verify' | 'recovery';

const chunk = (s: string) => s.replace(/(.{4})/g, '$1 ').trim();

function SetupQr({ url }: { url: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    QRCode.toString(url, {
      type: 'svg',
      margin: 1,
      color: { dark: '#0b0b0a', light: '#f2f1ec' },
    }).then(setSvg, () => setSvg(''));
  }, [url]);
  return (
    <div
      className="qr"
      style={{ width: 188, height: 188 }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

const Err = ({ msg }: { msg: string }) =>
  msg ? <p style={{ color: 'var(--st-danger)', fontSize: 13, marginBottom: 10 }}>{msg}</p> : null;

export default function AdminLogin() {
  const router = useRouter();
  const copy = useCopy();
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string }>();
  const [codes, setCodes] = useState<string[]>();
  const [saved, setSaved] = useState(false);
  const [useRecovery, setUseRecovery] = useState(false);

  const wrap = async (fn: () => Promise<void>) => {
    setErr('');
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };

  const submitPassword = (e: React.FormEvent) => {
    e.preventDefault();
    void wrap(async () => {
      const r = await api<{ stage: 'totp_setup' | 'totp_required' }>('/admin/auth/login', {
        body: { email, password },
      });
      if (r.stage === 'totp_setup') {
        setSetup(await api('/admin/auth/totp/setup'));
        setStep('setup');
      } else setStep('verify');
      setCode('');
    });
  };
  const submitEnable = (e: React.FormEvent) => {
    e.preventDefault();
    void wrap(async () => {
      const r = await api<{ recoveryCodes: string[] }>('/admin/auth/totp/enable', {
        body: { code },
      });
      setCodes(r.recoveryCodes);
      setStep('recovery');
    });
  };
  const submitVerify = (e: React.FormEvent) => {
    e.preventDefault();
    void wrap(async () => {
      await api('/admin/auth/totp/verify', {
        body: useRecovery ? { recoveryCode: recovery } : { code },
      });
      router.replace('/admin');
    });
  };
  const download = () => {
    const text = `南洋桌面管理后台恢复码（${email}）\n每个只能使用一次，请离线保存。\n\n${codes!.join('\n')}\n`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = 'nanyangdesk-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 20 }}>
      <div className="box" style={{ width: '100%', maxWidth: 420, padding: 30 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 22 }}>
          <span style={{ width: 24, height: 24, display: 'inline-flex' }}>
            <BrandMark />
          </span>
          <b style={{ fontSize: 15 }}>南洋桌面 · 管理后台</b>
        </div>

        {step === 'password' && (
          <form onSubmit={submitPassword}>
            <div className="field">
              <label>邮箱</label>
              <input
                className="input"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label>密码</label>
              <input
                className="input"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Err msg={err} />
            <button className="btn btn-primary btn-block" disabled={busy}>
              下一步
            </button>
          </form>
        )}

        {step === 'setup' && setup && (
          <form onSubmit={submitEnable}>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>绑定两步验证</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              后台能看到所有机器的登录密码，所以必须绑定。用 Google Authenticator、1Password 等 App
              扫码，或手动输入下面的密钥。
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', margin: '14px 0' }}>
              <SetupQr url={setup.otpauthUrl} />
            </div>
            <div className="field">
              <label>手动输入密钥（类型选「基于时间」）</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="input mono" readOnly value={chunk(setup.secret)} />
                <button
                  type="button"
                  className="btn btn-line btn-sm"
                  onClick={() => copy(setup.secret, '密钥已复制')}
                >
                  复制
                </button>
              </div>
            </div>
            <div className="field">
              <label>输入 App 里显示的 6 位动态码</label>
              <input
                className="input mono"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
            </div>
            <Err msg={err} />
            <button className="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
              验证并启用
            </button>
          </form>
        )}

        {step === 'recovery' && codes && (
          <div>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>请保存恢复码</h3>
            <p className="muted" style={{ fontSize: 13 }}>
              手机丢失时用恢复码登录，每个只能用一次，
              <b style={{ color: 'var(--ink)' }}>只显示这一次</b>。
            </p>
            <div
              className="dblock mono"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
                margin: '14px 0',
                fontSize: 13,
              }}
            >
              {codes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <button
                className="btn btn-line btn-sm"
                onClick={() => copy(codes.join('\n'), '恢复码已复制')}
              >
                复制全部
              </button>
              <button className="btn btn-line btn-sm" onClick={download}>
                下载 txt
              </button>
            </div>
            <div className="chk" style={{ marginBottom: 14 }}>
              <label>
                <input
                  type="checkbox"
                  checked={saved}
                  onChange={(e) => setSaved(e.target.checked)}
                />{' '}
                我已把恢复码保存到安全的地方
              </label>
            </div>
            <button
              className="btn btn-primary btn-block"
              disabled={!saved}
              onClick={() => router.replace('/admin')}
            >
              进入后台
            </button>
          </div>
        )}

        {step === 'verify' && (
          <form onSubmit={submitVerify}>
            <h3 style={{ fontSize: 16, marginBottom: 6 }}>两步验证</h3>
            {useRecovery ? (
              <div className="field">
                <label>恢复码</label>
                <input
                  className="input mono"
                  placeholder="xxxxx-xxxxx"
                  value={recovery}
                  onChange={(e) => setRecovery(e.target.value)}
                  autoFocus
                />
              </div>
            ) : (
              <div className="field">
                <label>验证器 App 里的 6 位动态码</label>
                <input
                  className="input mono"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                />
              </div>
            )}
            <Err msg={err} />
            <button
              className="btn btn-primary btn-block"
              disabled={busy || (useRecovery ? !recovery : code.length !== 6)}
            >
              登录
            </button>
            <p style={{ textAlign: 'center', marginTop: 12, fontSize: 12.5 }}>
              <a
                style={{ cursor: 'pointer', color: 'var(--ink2)' }}
                onClick={() => {
                  setUseRecovery(!useRecovery);
                  setErr('');
                }}
              >
                {useRecovery ? '改用动态码' : '手机不在身边？使用恢复码'}
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
