'use client';
import { useState } from 'react';
import { useAccount } from '@/components/account/AccountShell';
import { useToast } from '@/components/Toast';
import { api } from '@/lib/api';

export default function SettingsPage() {
  const { me, reload } = useAccount();
  const toast = useToast();
  const [wx, setWx] = useState(me.wechat ?? '');
  const [tg, setTg] = useState(me.telegram ?? '');
  const [saving, setSaving] = useState(false);
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwBusy, setPwBusy] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api('/me', { method: 'PATCH', body: { wechat: wx.trim(), telegram: tg.trim() } });
      await reload();
      toast('已保存');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const changePw = async () => {
    setPwErr('');
    if (!oldPw) return setPwErr('请输入当前密码');
    if (newPw.length < 8) return setPwErr('新密码至少 8 位');
    setPwBusy(true);
    try {
      await api('/me/password', { body: { oldPassword: oldPw, newPassword: newPw } });
      setOldPw('');
      setNewPw('');
      toast('密码已更新，其他设备已退出登录');
    } catch (e) {
      setPwErr((e as Error).message);
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <>
      <h2>账户设置</h2>
      <div className="panel" style={{ maxWidth: 560 }}>
        <h3>基本信息</h3>
        <div className="field">
          <label>登录邮箱</label>
          <input className="input" value={me.email} disabled />
        </div>
        <div className="row2">
          <div className="field">
            <label>微信号</label>
            <input
              className="input"
              value={wx}
              maxLength={64}
              onChange={(e) => setWx(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Telegram</label>
            <input
              className="input"
              value={tg}
              maxLength={64}
              onChange={(e) => setTg(e.target.value)}
            />
          </div>
        </div>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
      <div className="panel" style={{ maxWidth: 560 }}>
        <h3>修改密码</h3>
        <div className={`field${pwErr ? ' bad' : ''}`}>
          <label>当前密码</label>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            value={oldPw}
            onChange={(e) => setOldPw(e.target.value)}
          />
        </div>
        <div className="field">
          <label>
            新密码<small>至少 8 位</small>
          </label>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
          />
          {pwErr && (
            <div className="errmsg" style={{ display: 'block' }}>
              {pwErr}
            </div>
          )}
        </div>
        <button className="btn btn-line" onClick={changePw} disabled={pwBusy}>
          {pwBusy ? '更新中…' : '更新密码'}
        </button>
      </div>
      <div className="panel" style={{ maxWidth: 560 }}>
        <h3>通知</h3>
        <p className="muted" style={{ fontSize: 14 }}>
          订单状态变化、开通、到期前 7 / 3 / 1 天的提醒会发到 {me.email}
          ，并同步到站内通知（右上角铃铛）。
        </p>
      </div>
    </>
  );
}
