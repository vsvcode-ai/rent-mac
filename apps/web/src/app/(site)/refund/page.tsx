import type { Metadata } from 'next';
import Link from 'next/link';
import { RefundCalc } from './RefundCalc';

export const metadata: Metadata = {
  title: '退款政策 · 南洋桌面',
  description: '南洋桌面的退款规则与退款金额计算器。',
};

export default function RefundPage() {
  return (
    <div className="wrap page" style={{ maxWidth: 860 }}>
      <div className="kicker">政策</div>
      <h1 className="page-title" style={{ fontSize: 40 }}>
        退款政策
      </h1>
      <p className="muted" style={{ fontSize: 17, margin: '8px 0 30px' }}>
        我们希望退款这件事清楚、公平。所有退款都通过闲鱼退款流程办理。
      </p>

      <table className="cmp policy">
        <thead>
          <tr>
            <th>情况</th>
            <th>处理方式</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>付款后、开通前</td>
            <td>全额退款。</td>
          </tr>
          <tr>
            <td>超过 7 天未开通</td>
            <td>
              你可以选择<b>全额退款</b>，或继续等待并获得补偿：每超 1 天，租期补 1 天。
            </td>
          </tr>
          <tr>
            <td>开通后 48 小时内，机器或网络无法正常使用且无法修复</td>
            <td>全额退款。</td>
          </tr>
          <tr>
            <td>租期内机器故障停机超过 24 小时</td>
            <td>按停机天数补偿租期。</td>
          </tr>
          <tr>
            <td>开通 48 小时后主动退租</td>
            <td>
              已使用时长按<b>月付价 ¥799 / 月</b>
              重新计算（不足一个月按一个月），退还差额。月付订单不退。
            </td>
          </tr>
          <tr>
            <td>
              违反
              <Link className="link" href="/aup">
                可接受使用政策
              </Link>
              被停机
            </td>
            <td>不退款。</td>
          </tr>
        </tbody>
      </table>

      <RefundCalc />

      <h3 style={{ margin: '36px 0 12px' }}>补充说明</h3>
      <ul style={{ paddingLeft: 20, color: 'var(--ink2)', display: 'grid', gap: 8, fontSize: 15 }}>
        <li>
          租期从<b style={{ color: 'var(--ink)' }}>开通当天</b>开始计算，不从付款日算。
        </li>
        <li>退款申请请在「我的账户 → 工单」提交，或联系客服；我们会在 3 个工作日内处理。</li>
        <li>退款金额按闲鱼实际支付金额为准，平台扣费规则以闲鱼为准。</li>
        <li>退租后机器会被回收并抹盘重装，请提前备份数据。</li>
      </ul>
    </div>
  );
}
