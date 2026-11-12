const NAMES = ['确认订单', '闲鱼付款', '等待开通', '连接使用'];

/** 订单四步进度条：step 为当前所在步骤（0 起），之前的显示为已完成 */
export function OrderFlow({ step }: { step: number }) {
  return (
    <div className="flow">
      {NAMES.map((n, i) => (
        <span key={n} style={{ display: 'contents' }}>
          <div className={`s ${i < step ? 'done' : i === step ? 'on' : ''}`}>
            <b>{i < step ? '✓' : i + 1}</b>
            <span>{n}</span>
          </div>
          {i < 3 && <div className={`bar ${i < step ? 'done' : ''}`}></div>}
        </span>
      ))}
    </div>
  );
}
