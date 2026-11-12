'use client';
import { useState } from 'react';

type Shot = 'dl' | 'code' | 'ok' | 'phone';
type Step = [title: string, text: string, shot: Shot];

const dot = (
  <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--hl3)' }}></span>
);

function ShotArt({ kind }: { kind: Shot }) {
  if (kind === 'dl')
    return (
      <div className="ui">
        <b style={{ fontSize: 13 }}>UU 远程</b>
        <i></i>
        <i style={{ width: '70%' }}></i>
        <i className="b"></i>
      </div>
    );
  if (kind === 'code')
    return (
      <div className="ui">
        <small className="muted">设备代码</small>
        <div className="code">583 920 174</div>
        <i></i>
        <small className="muted">连接密码</small>
        <div className="code">••••••••</div>
        <i className="b" style={{ width: '100%' }}></i>
      </div>
    );
  if (kind === 'ok')
    return (
      <div className="ui" style={{ minWidth: 210 }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
          {dot}
          {dot}
          {dot}
        </div>
        <div
          style={{
            background: 'var(--canvas)',
            border: '1px solid var(--hl)',
            borderRadius: 6,
            padding: 14,
            textAlign: 'center',
          }}
        >
          <b style={{ fontWeight: 500 }}>macOS 登录</b>
          <div className="mono" style={{ fontSize: 11, marginTop: 4, color: 'var(--ink3)' }}>
            nydesk
          </div>
          <i></i>
        </div>
      </div>
    );
  return (
    <div
      className="ui"
      style={{ minWidth: 90, borderRadius: 16, padding: '14px 10px', textAlign: 'center' }}
    >
      <b style={{ fontSize: 11 }}>连接中…</b>
      <i></i>
      <i style={{ width: '60%', margin: '6px auto' }}></i>
      <i className="b" style={{ width: '100%' }}></i>
    </div>
  );
}

const T: Record<string, { label: string; steps: Step[] }> = {
  mac: {
    label: 'Mac',
    steps: [
      [
        '在你的 Mac 上安装 UU 远程',
        '从 UU 远程官网下载 macOS 版本，拖入「应用程序」后打开，按提示授权。',
        'dl',
      ],
      [
        '输入设备代码和密码',
        '在「账户 → 我的设备」里复制 UU 设备代码和连接密码，粘贴到 UU 远程主界面。',
        'code',
      ],
      ['看到远程桌面', '连接成功后会看到马来西亚那台 Mac mini 的桌面。', 'ok'],
      [
        '输入 macOS 登录密码',
        '首次进入需要输入 macOS 用户名和密码（同在「我的设备」里）。登录后可修改密码。',
        'ok',
      ],
    ],
  },
  win: {
    label: 'Windows',
    steps: [
      ['在 Windows 上安装 UU 远程', '下载 Windows 版安装包，安装后打开。', 'dl'],
      ['输入设备代码和密码', '复制「我的设备」里的 UU 设备代码和连接密码。', 'code'],
      [
        '看到远程桌面',
        '连接成功后即可用鼠标键盘操作。快捷键以远程 Mac 为准，Ctrl 对应 ⌘ 请在设置里调整。',
        'ok',
      ],
      ['输入 macOS 登录密码', '输入 macOS 用户名和密码登录。', 'ok'],
    ],
  },
  ios: {
    label: 'iPhone / iPad',
    steps: [
      ['在 App Store 安装 UU 远程', '搜索「UU 远程」下载安装，允许通知权限。', 'dl'],
      ['添加设备', '输入设备代码和连接密码，点击连接。', 'code'],
      ['触控操作', '单指移动鼠标，双指滚动，长按右键。可随时查看任务进度或日志。', 'phone'],
      ['想用外接键盘？', '蓝牙键盘接入后可直接输入，适合在外面快速处理事情。', 'phone'],
    ],
  },
  and: {
    label: '安卓',
    steps: [
      ['安装 UU 远程', '在应用商店搜索「UU 远程」安装。', 'dl'],
      ['添加设备', '输入设备代码和连接密码，点击连接。', 'code'],
      ['触控操作', '单指移动鼠标，双指缩放，长按右键。', 'phone'],
      ['保持后台连接', '在系统设置里允许 UU 远程后台运行，避免切换应用后断开。', 'phone'],
    ],
  },
};

export function Tutorials() {
  const [os, setOs] = useState('mac');
  return (
    <>
      <div className="os-tabs" role="tablist">
        {Object.entries(T).map(([k, v]) => (
          <button
            key={k}
            role="tab"
            aria-selected={os === k}
            className={os === k ? 'on' : ''}
            onClick={() => setOs(k)}
          >
            {v.label}
          </button>
        ))}
      </div>
      {Object.entries(T).map(([k, v]) => (
        <div key={k} className={`tut${os === k ? ' on' : ''}`}>
          {v.steps.map(([h, p, shot], i) => (
            <div className="st" key={i}>
              <div className="no">STEP {i + 1}</div>
              <h4>{h}</h4>
              <p>{p}</p>
              <div className="shot">
                <ShotArt kind={shot} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}
