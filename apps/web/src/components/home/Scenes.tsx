'use client';
import { useState } from 'react';

const TABS = ['AI 辅助开发', 'iOS 构建与上架', '自动化挂机', '跨境协作'];

export function Scenes() {
  const [on, setOn] = useState(0);
  return (
    <>
      <div className="scene-tabs rv" role="tablist">
        {TABS.map((t, i) => (
          <button
            key={t}
            className={on === i ? 'on' : ''}
            role="tab"
            aria-selected={on === i}
            onClick={() => setOn(i)}
          >
            <i>{'ABCD'[i]}</i>
            {t}
          </button>
        ))}
      </div>
      <div className={`scene in${on === 0 ? ' on' : ''}`}>
        <div>
          <h3>让 AI 工具在稳定环境里长跑</h3>
          <p>用 Claude Code 之类的工具写代码、调试、构建。任务一跑几个小时，合上笔记本也不会断。</p>
          <ul>
            <li>固定出口 IP，登录状态更稳定</li>
            <li>终端会话常驻，随时用手机看进度</li>
            <li>使用你自己的账号，我们不代购、不转售账号</li>
          </ul>
        </div>
        <div>
          <div className="win">
            <div className="bar">
              <i></i>
              <i></i>
              <i></i>
              <span>nydesk@mini-0042 — tmux</span>
            </div>
            <div className="body">
              <span className="d">~/projects/app $</span> tmux attach -t claude
              <br />
              <span className="b">●</span> 正在重构 <span className="y">PaymentService</span>
              <br />
              <span className="d"> ├ 读取 14 个文件</span>
              <br />
              <span className="d"> ├ 修改 src/payment/service.ts</span>
              <br />
              <span className="d"> └ 运行测试 </span>
              <span className="g">48 passed</span>
              <br />
              <br />
              <span className="b">●</span> 已运行 <span className="y">2 小时 14 分</span>，仍在进行
              <br />
              <span className="d">$</span> <span className="cursor"></span>
            </div>
          </div>
        </div>
      </div>
      <div className={`scene in${on === 1 ? ' on' : ''}`}>
        <div>
          <h3>没有 Mac，也能走完上架</h3>
          <p>签名、打包、提审，整套流程在真机上跑。不用为了发一个版本去买一台电脑。</p>
          <ul>
            <li>完整 macOS 环境，可装 Xcode</li>
            <li>独立构建机，不占用个人电脑</li>
            <li>用完续费或到期退租，没有设备压在手里</li>
          </ul>
        </div>
        <div>
          <div className="win light">
            <div className="bar">
              <i></i>
              <i></i>
              <i></i>
              <span>构建任务</span>
            </div>
            <div className="body" style={{ padding: '6px 20px' }}>
              <div className="mock-row">
                <span className="dot"></span>
                <div className="t">
                  Archive · Release
                  <br />
                  <small>2 分 41 秒</small>
                </div>
                <span className="pill ok">成功</span>
              </div>
              <div className="mock-row">
                <span className="dot"></span>
                <div className="t">
                  代码签名
                  <br />
                  <small>Distribution</small>
                </div>
                <span className="pill ok">成功</span>
              </div>
              <div className="mock-row">
                <span className="dot" style={{ background: 'var(--ink)' }}></span>
                <div className="t">
                  上传 App Store Connect
                  <br />
                  <small>进行中</small>
                </div>
                <div className="prog">
                  <i style={{ width: '78%' }}></i>
                </div>
              </div>
              <div className="mock-row">
                <span className="dot" style={{ background: 'var(--hl3)' }}></span>
                <div className="t">
                  提交审核
                  <br />
                  <small>等待上传完成</small>
                </div>
                <span className="pill">排队</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={`scene in${on === 2 ? ' on' : ''}`}>
        <div>
          <h3>睡前派活，醒来收成品</h3>
          <p>
            爬虫、批量处理、渲染、自动化脚本，交给一台 24 小时在线的机器，电费和噪音都留在机房。
          </p>
          <ul>
            <li>7×24 在线监控，离线自动告警</li>
            <li>故障可随时提交工单</li>
            <li>需要更多台？咨询客服即可</li>
          </ul>
        </div>
        <div>
          <div className="win light">
            <div className="bar">
              <i></i>
              <i></i>
              <i></i>
              <span>定时任务</span>
            </div>
            <div className="body" style={{ padding: '6px 20px' }}>
              <div className="mock-row">
                <span className="dot"></span>
                <div className="t">
                  每日数据抓取
                  <br />
                  <small>每天 03:00 · 上次成功</small>
                </div>
                <small className="mono">41d</small>
              </div>
              <div className="mock-row">
                <span className="dot"></span>
                <div className="t">
                  图片批量压缩
                  <br />
                  <small>每小时</small>
                </div>
                <small className="mono">41d</small>
              </div>
              <div className="mock-row">
                <span className="dot" style={{ background: 'var(--hl3)' }}></span>
                <div className="t">
                  视频转码
                  <br />
                  <small>手动触发</small>
                </div>
                <span className="pill">空闲</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={`scene in${on === 3 ? ' on' : ''}`}>
        <div>
          <h3>海外工作空间，一连就到</h3>
          <p>出差、出海、团队分布在不同时区，都可以连到同一套工作环境，查看文件、跟进项目。</p>
          <ul>
            <li>马来西亚机房，亚太网络延迟友好</li>
            <li>换人接手不用重装环境</li>
            <li>半年付、年付含 1 对 1 专属客服</li>
          </ul>
        </div>
        <div>
          <div className="win light">
            <div className="bar">
              <i></i>
              <i></i>
              <i></i>
              <span>共享项目</span>
            </div>
            <div className="body" style={{ padding: '6px 20px' }}>
              <div className="mock-row">
                <span
                  style={{ width: 18, height: 14, borderRadius: 3, background: 'var(--hl3)' }}
                ></span>
                <div className="t">
                  设计稿 v3
                  <br />
                  <small>更新于 今天 14:20</small>
                </div>
              </div>
              <div className="mock-row">
                <span
                  style={{ width: 18, height: 14, borderRadius: 3, background: 'var(--hl3)' }}
                ></span>
                <div className="t">
                  投放素材
                  <br />
                  <small>更新于 昨天</small>
                </div>
              </div>
              <div className="mock-row">
                <span
                  style={{
                    width: 14,
                    height: 18,
                    borderRadius: 2,
                    background: 'var(--hl2)',
                    margin: '0 2px',
                  }}
                ></span>
                <div className="t">
                  周报.numbers
                  <br />
                  <small>更新于 3 天前</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
