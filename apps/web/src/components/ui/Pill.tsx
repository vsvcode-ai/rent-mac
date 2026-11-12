import { ORDER_STATUS_LABEL, type OrderStatus } from '@nyd/shared';

/** 状态用「中性胶囊 + 彩色圆点」，不做大面积彩色底（DESIGN.md） */
const dot: Record<OrderStatus, string> = {
  pending: 'bg-warn',
  verifying: 'bg-info',
  failed: 'bg-danger',
  queued: 'bg-ink',
  active: 'bg-sig',
  done: 'bg-ink-dim',
  cancelled: 'bg-ink-dim',
  refunding: 'bg-warn',
  refunded: 'bg-ink-dim',
  renewed: 'bg-sig',
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-s3 px-2.5 py-0.5 text-[12.5px] text-ink-m">
      <i className={`size-1.5 rounded-full ${dot[status]}`} />
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
