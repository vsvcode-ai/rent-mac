import type { CSSProperties } from 'react';
import Link from 'next/link';
import { DataCenter } from '@/components/home/DataCenter';
import { Hero } from '@/components/home/Hero';
import { PlansProvider } from '@/components/home/PlansContext';
import { Pricing } from '@/components/home/Pricing';
import { Scenes } from '@/components/home/Scenes';
import { RevealInit } from '@/lib/anim';
import { SupportLink } from '@/lib/support';

const d = (v: string) => ({ '--d': v }) as CSSProperties;

export default function Home() {
  return (
    <PlansProvider>
      <RevealInit />
      <Hero />

      {/* 01 卖点 */}
      <section className="sec" id="why">
        <div className="wrap">
          <div className="sec-head split">
            <div>
              <div className="kicker rv">
                <i>01</i>专属设备
              </div>
              <h2 className="rv">
                <span className="cl">不是虚拟机，</span>
                <br />
                <span className="o cl">是只属于你的整台 Mac。</span>
              </h2>
            </div>
            <p className="rv" style={d('.1s')}>
              CPU、内存、硬盘和网络出口都不和别人共享。租期内，这台机器只为你工作；到期回收时整机抹盘，不留痕迹。
            </p>
          </div>
          <div className="grid4">
            <div className="card feat rv">
              <span className="num">/01</span>
              <div className="ic">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="9" width="18" height="7" rx="2" />
                  <path d="M8 19h8" />
                </svg>
              </div>
              <h3>独享实体机</h3>
              <p>真实的 Apple 芯片 Mac mini，性能不被抢占，跑长任务时间可控。</p>
            </div>
            <div className="card feat rv" style={d('.08s')}>
              <span className="num">/02</span>
              <div className="ic">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
                </svg>
              </div>
              <h3>独立固定 IP</h3>
              <p>每台机器一条独立宽带，出口地址不漂移。宽带费用已包含在租金里。</p>
            </div>
            <div className="card feat rv" style={d('.16s')}>
              <span className="num">/03</span>
              <div className="ic">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="4" width="14" height="10" rx="2" />
                  <rect x="15" y="9" width="7" height="11" rx="1.5" />
                  <path d="M6 18h5" />
                </svg>
              </div>
              <h3>多端远程连接</h3>
              <p>用 UU 远程从 Mac、Windows 或手机连接，随时看进度、接着干。</p>
            </div>
            <div className="card feat rv" style={d('.24s')}>
              <span className="num">/04</span>
              <div className="ic">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <h3>环境长期保留</h3>
              <p>项目、依赖和登录状态都留在机器上，断开重连即可继续工作。</p>
            </div>
          </div>
        </div>
      </section>

      {/* 02 场景 */}
      <section className="sec" id="scenes">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker rv">
              <i>02</i>使用场景
            </div>
            <h2 className="rv">
              <span className="cl">你的想法，</span>
              <span className="o cl">不受距离限制。</span>
            </h2>
          </div>
          <Scenes />
        </div>
      </section>

      {/* 03 机房 */}
      <section className="sec" id="dc">
        <div className="wrap">
          <div className="kicker rv">
            <i>03</i>马来西亚机房
          </div>
          <DataCenter />
        </div>
      </section>

      {/* 反色大色带：每页唯一的大面积 */}
      <section className="sec" style={{ paddingTop: 140 }}>
        <div className="wrap">
          <div className="band rv">
            <div className="big">
              ¥499<small>/ 月</small>
            </div>
            <div className="side">
              <span className="k">年付 · M4 · 16GB · 256GB</span>
              <p>
                一台独享的 Mac mini，独立 IP 宽带已包含。比月付一年省 ¥3,600，还含 1 对 1 专属客服。
              </p>
              <a className="btn btn-primary btn-lg" href="#pricing">
                选择租期 <span className="arr">→</span>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 04 对比 */}
      <section className="sec">
        <div className="wrap">
          <div className="sec-head split">
            <div>
              <div className="kicker rv">
                <i>04</i>价格对比
              </div>
              <h2 className="rv">
                <span className="cl">同样是一台 Mac，</span>
                <br />
                <span className="o cl">不必为机房和库存买单。</span>
              </h2>
            </div>
            <p className="rv" style={d('.1s')}>
              不用一次性买设备，也不用为云厂商的机房和库存付钱。用多久付多久，到期即止。
            </p>
          </div>
          <table className="cmp rv">
            <thead>
              <tr>
                <th></th>
                <th className="hl">南洋桌面</th>
                <th>自己买一台</th>
                <th>国际云 Mac</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>每月费用（M4 · 16GB）</td>
                <td className="hl">¥499–799</td>
                <td>一次性 ¥4,000+</td>
                <td>约 ¥6,500</td>
              </tr>
              <tr>
                <td>需要买设备</td>
                <td className="hl">不需要</td>
                <td>需要，用不上就闲置</td>
                <td>不需要</td>
              </tr>
              <tr>
                <td>独立固定 IP</td>
                <td className="hl">包含</td>
                <td>需自己搞定海外网络</td>
                <td>视供应商</td>
              </tr>
              <tr>
                <td>多端远程连接</td>
                <td className="hl">UU 远程，含手机</td>
                <td>—</td>
                <td>多为 SSH / VNC</td>
              </tr>
              <tr>
                <td>想停就停</td>
                <td className="hl">到期即止，可续费</td>
                <td>设备压在手里</td>
                <td>多有最短租期</td>
              </tr>
            </tbody>
          </table>
          <p className="note">
            参考价，以各厂商官网为准。对比数据为示意，国际云 Mac 价格按公开挂牌价折算。
          </p>
        </div>
      </section>

      {/* 05 套餐 */}
      <section className="sec" id="pricing">
        <div className="wrap">
          <div className="sec-head split">
            <div>
              <div className="kicker rv">
                <i>05</i>价格
              </div>
              <h2 className="rv">
                <span className="cl">
                  选一个<span className="o">适合你的</span>租期。
                </span>
              </h2>
            </div>
            <p className="rv" style={d('.1s')}>
              一台专属 Mac mini，独立 IP 宽带已包含。租期越长，每月越便宜。
            </p>
          </div>
          <Pricing />
        </div>
      </section>

      {/* 06 流程 */}
      <section className="sec">
        <div className="wrap">
          <div className="sec-head">
            <div className="kicker rv">
              <i>06</i>怎么租
            </div>
            <h2 className="rv">
              <span className="cl">四步，</span>
              <span className="o cl">连上你的 Mac。</span>
            </h2>
          </div>
          <div className="steps">
            <div className="step rv">
              <div className="no">01</div>
              <h3>选择套餐</h3>
              <p>选好租期和台数，登录后提交订单，拿到订单号。</p>
            </div>
            <div className="step rv" style={d('.08s')}>
              <div className="no">02</div>
              <h3>闲鱼付款</h3>
              <p>到闲鱼拍下对应租期的商品，留言订单号，回来填写闲鱼订单号。</p>
            </div>
            <div className="step rv" style={d('.16s')}>
              <div className="no">03</div>
              <h3>等待开通</h3>
              <p>客服核对收款，运维 7 天内完成配置，邮件和站内信通知你。</p>
            </div>
            <div className="step rv" style={d('.24s')}>
              <div className="no">04</div>
              <h3>连接使用</h3>
              <p>在「我的设备」查看连接信息，用 UU 远程连上即可。</p>
            </div>
          </div>
        </div>
      </section>

      {/* 07 FAQ */}
      <section className="sec" id="faq">
        <div className="wrap faq-wrap">
          <div className="sec-head">
            <div className="kicker rv">
              <i>07</i>常见问题
            </div>
            <h2 className="rv">
              你可能
              <br />
              <span className="o">还想知道。</span>
            </h2>
            <p className="rv" style={{ fontSize: 15 }}>
              没找到答案？
              <SupportLink />
            </p>
          </div>
          <div className="faq rv">
            <details open>
              <summary>机器部署在哪里？</summary>
              <p>
                全部部署在马来西亚机房，首批 200 台 Mac mini
                M4。租期内你通过远程连接使用自己的那台。
              </p>
            </details>
            <details>
              <summary>为什么要到闲鱼付款？</summary>
              <p>
                为了让交易有平台担保，付款和售后都有记录。你在网站下单拿到订单号，再到闲鱼拍下对应商品并留言订单号，我们核对后开通。
              </p>
            </details>
            <details>
              <summary>付款后多久能用？</summary>
              <p>客服核对收款后，7 天内开通，通常会更快。租期从开通当天开始计算，不从付款日算。</p>
            </details>
            <details>
              <summary>如何连接和使用？</summary>
              <p>
                开通后在「我的设备」里查看 UU 远程的设备代码和连接密码，安装 UU 远程即可连接，支持
                Mac、Windows 电脑和手机。
              </p>
            </details>
            <details>
              <summary>宽带怎么收费？</summary>
              <p>每台机器配独立 IP 宽带，费用已包含在租金里，不额外收费。</p>
            </details>
            <details>
              <summary>可以在上面用 Claude 等 AI 工具吗？</summary>
              <p>可以，请使用你自己的账号。我们只提供机器，不代购、不转售任何第三方账号。</p>
            </details>
            <details>
              <summary>可以退款吗？</summary>
              <p>
                开通前可全额退款；开通后的规则见{' '}
                <Link className="link" href="/refund">
                  退款政策
                </Link>
                ，页面里有退款金额计算器。
              </p>
            </details>
            <details>
              <summary>能租多台，或者其他配置吗？</summary>
              <p>
                单笔最多 10 台。需要更多台数或其他机型，请
                <Link className="link" href="/consult">
                  提交咨询
                </Link>
                ，配置与价格另议。
              </p>
            </details>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <div className="cta rv">
            <div>
              <h2>
                <span className="cl">从一台专属 Mac</span>
                <br />
                <span className="o">开始。</span>
              </h2>
              <p>年付每月 ¥499，独立 IP 已包含。</p>
            </div>
            <div className="acts">
              <a className="btn btn-primary btn-lg" href="#pricing">
                选择套餐 <span className="arr">→</span>
              </a>
              <Link className="btn btn-ghost btn-lg" href="/consult">
                联系我们
              </Link>
            </div>
          </div>
        </div>
      </section>
    </PlansProvider>
  );
}
