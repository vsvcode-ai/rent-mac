import type { Metadata } from 'next';
import Link from 'next/link';
import { Tutorials } from './Tutorials';

export const metadata: Metadata = {
  title: '帮助中心 · 南洋桌面',
  description: '用 UU 远程连接你的 Mac mini：Mac、Windows、iPhone、安卓教程与常见问题。',
};

const FAQ: [string, React.ReactNode][] = [
  ['机器部署在哪里？', '全部在马来西亚机房，首批 200 台 Mac mini M4（16GB / 256GB）。'],
  [
    '为什么要到闲鱼付款？',
    '闲鱼提供担保交易，付款、发货、确认收货、售后都有记录。你在网站下单拿到订单号，到闲鱼拍下对应商品并留言订单号，我们核对后开通。',
  ],
  ['付款后多久能用？', '客服核对收款后，7 天内开通，通常更快。租期从开通当天开始算。'],
  ['开通后要在闲鱼点确认收货吗？', '建议你确认能正常连接后再点确认收货。我们会在开通后提醒你。'],
  ['宽带怎么收费？', '独立 IP 宽带已包含在租金里，不额外收费。'],
  [
    '怎么续费？',
    '到「我的账户 → 我的设备」点「续费」，生成续费订单，同样到闲鱼付款，客服确认后自动延长到期时间。到期前 7 / 3 / 1 天我们会邮件提醒。',
  ],
  [
    '到期后数据会怎样？',
    '到期后有 3 天宽限期，期间续费可保留全部数据。宽限期结束后机器会被回收并抹盘重装，数据无法找回，请提前备份。',
  ],
  [
    '可以在上面用 Claude 等 AI 工具吗？',
    '可以，请使用你自己的账号。我们只提供机器，不代购、不转售任何第三方账号。',
  ],
  [
    '禁止哪些用途？',
    <>
      挖矿、发送垃圾邮件、网络攻击与扫描、传播违法内容等。违反会被直接停机且不退款。详见
      <Link className="link" href="/aup">
        可接受使用政策
      </Link>
      。
    </>,
  ],
  [
    '能退款吗？',
    <>
      开通前全额退款，开通后的规则见
      <Link className="link" href="/refund">
        退款政策
      </Link>
      。
    </>,
  ],
];

export default function HelpPage() {
  return (
    <div className="wrap">
      <div className="help-hero">
        <div className="kicker">帮助中心</div>
        <h1>连接你的 Mac，只需几步</h1>
        <p className="muted" style={{ marginTop: 12, fontSize: 17 }}>
          开通后用 UU 远程连接，电脑和手机都可以。
        </p>
      </div>

      <Tutorials />

      <div
        className="alert info"
        style={{ marginTop: 24, maxWidth: 780, marginLeft: 'auto', marginRight: 'auto' }}
      >
        <span>i</span>
        <div>
          <b>连不上？</b>先确认设备代码和密码无误；再检查本机网络；仍然不行，到「
          <Link className="link" href="/account/tickets">
            我的账户 → 工单
          </Link>
          」提交，附上截图。机器离线我们会主动处理。
        </div>
      </div>

      <section className="sec" id="faq" style={{ paddingBottom: 40 }}>
        <div className="sec-head" style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 32 }}>常见问题</h2>
        </div>
        <div className="faq">
          {FAQ.map(([q, a], i) => (
            <details key={q} open={i === 0}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
