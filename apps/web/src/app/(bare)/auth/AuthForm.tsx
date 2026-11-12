'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Brand } from '@/components/Brand';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';
import { safeNext } from '@/lib/flow';

type Mode = 'login' | 'reg' | 'forgot';
const EMAIL_RE = /^\S+@\S+\.\S+$/;

export function AuthForm() {
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const toast = useToast();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pwd, setPwd] = useState('');
  const [agree, setAgree] = useState(false);
  const [bad, setBad] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [cd, setCd] = useState(0);
  const [serverErr, setServerErr] = useState('');
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => () => clearInterval(timer.current), []);

  const needCode = mode !== 'login';
  const title = mode === 'login' ? '欢迎回来' : mode === 'reg' ? '创建账户' : '重置密码';
  const submitText = mode === 'login' ? '登录' : mode === 'reg' ? '注册并登录' : '重置密码';

  const switchMode = (m: Mode) => {
    setMode(m);
    setBad({});
    setServerErr('');
    setCode('');
  };

  const startCountdown = () => {
    setCd(60);
    clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCd((c) => {
        if (c <= 1) {
          clearInterval(timer.current);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  };

  const sendCode = async () => {
    if (cd || busy) return;
    if (!EMAIL_RE.test(email)) {
      setBad({ email: true });
      return;
    }
    setServerErr('');
    try {
      await api(mode === 'reg' ? '/auth/send-code' : '/auth/forgot-password', { body: { email } });
      toast('验证码已发送，请查收邮件（10 分钟内有效）');
      startCountdown();
    } catch (e) {
      setServerErr((e as Error).message);
      // 429 说明 60 秒内已发过，同样开始倒计时避免反复点击
      if ((e as { status?: number }).status === 429) startCountdown();
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const b = {
      email: !EMAIL_RE.test(email),
      pwd: pwd.length < (mode === 'login' ? 1 : 8),
      code: needCode && !/^\d{6}$/.test(code),
    };
    setBad(b);
    setServerErr('');
    if (b.email || b.pwd || b.code) return;
    if (mode === 'reg' && !agree) {
      toast('请先勾选同意相关条款');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'forgot') {
        await api('/auth/reset-password', { body: { email, code, password: pwd } });
        toast('密码已重置，请用新密码登录');
        setPwd('');
        switchMode('login');
        setBusy(false);
        return;
      }
      if (mode === 'reg') await api('/auth/register', { body: { email, code, password: pwd } });
      else await api('/auth/login', { body: { email, password: pwd } });
      // 整页跳转，让页头等处的登录状态一并刷新
      window.location.assign(next);
    } catch (err) {
      setServerErr((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth-side">
        <Brand />
        <h2>
          一台专属 Mac，
          <br />
          在南洋等你。
        </h2>
        <p>注册后即可下单，在「我的设备」里查看连接信息，到期前我们会提醒你续费。</p>
        <ul>
          <li>马来西亚机房，独享实体 Mac mini</li>
          <li>独立固定 IP，宽带已包含</li>
          <li>闲鱼担保交易，7 天内开通</li>
        </ul>
      </div>
      <div className="auth-main">
        <div className="auth-box">
          <Link className="link" href="/" style={{ fontSize: 14 }}>
            ← 返回首页
          </Link>
          <h1 style={{ marginTop: 18 }}>{title}</h1>
          {mode !== 'forgot' && (
            <div className="tabs-s" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                className={mode === 'login' ? 'on' : ''}
                onClick={() => switchMode('login')}
              >
                登录
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'reg'}
                className={mode === 'reg' ? 'on' : ''}
                onClick={() => switchMode('reg')}
              >
                创建账户
              </button>
            </div>
          )}
          <form onSubmit={submit} noValidate>
            <div className={`field${bad.email ? ' bad' : ''}`}>
              <label htmlFor="email">邮箱</label>
              <input
                id="email"
                className={`input${bad.email ? ' err' : ''}`}
                type="email"
                placeholder="you@example.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value.trim())}
              />
              <div className="errmsg">请输入有效的邮箱地址</div>
            </div>
            {needCode && (
              <div className={`field${bad.code ? ' bad' : ''}`}>
                <label htmlFor="code">邮箱验证码</label>
                <div className="input-btn">
                  <input
                    id="code"
                    className={`input${bad.code ? ' err' : ''}`}
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="6 位验证码"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <button
                    type="button"
                    className="btn btn-line"
                    style={{ minWidth: 116 }}
                    onClick={sendCode}
                    disabled={cd > 0}
                  >
                    {cd > 0 ? `${cd}s 后重发` : '获取验证码'}
                  </button>
                </div>
                <div className="errmsg">请输入 6 位验证码</div>
              </div>
            )}
            <div className={`field${bad.pwd ? ' bad' : ''}`}>
              <label htmlFor="pwd">
                {mode === 'forgot' ? '新密码' : '密码'}
                {needCode && <small>至少 8 位</small>}
              </label>
              <input
                id="pwd"
                className={`input${bad.pwd ? ' err' : ''}`}
                type="password"
                placeholder="••••••••"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={pwd}
                onChange={(e) => setPwd(e.target.value)}
              />
              <div className="errmsg">{mode === 'login' ? '请输入密码' : '密码至少 8 位'}</div>
            </div>
            {mode === 'reg' && (
              <label className="check" style={{ marginBottom: 18 }}>
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                />
                <span>
                  我已阅读并同意
                  <Link className="link" href="/terms" target="_blank">
                    服务条款
                  </Link>
                  、
                  <Link className="link" href="/privacy" target="_blank">
                    隐私政策
                  </Link>
                  和
                  <Link className="link" href="/aup" target="_blank">
                    可接受使用政策
                  </Link>
                </span>
              </label>
            )}
            {serverErr && (
              <div className="alert danger" role="alert" style={{ marginBottom: 14 }}>
                <span>!</span>
                <div>{serverErr}</div>
              </div>
            )}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? '请稍候…' : submitText}
            </button>
            <p className="muted" style={{ fontSize: 13, marginTop: 16, textAlign: 'center' }}>
              {mode === 'login' && (
                <a
                  className="link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    switchMode('forgot');
                  }}
                >
                  忘记密码？
                </a>
              )}
              {mode === 'forgot' && (
                <a
                  className="link"
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    switchMode('login');
                  }}
                >
                  返回登录
                </a>
              )}
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
