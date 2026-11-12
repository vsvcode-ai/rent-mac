'use client';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAdmin } from '@/components/admin/context';
import { Check, ErrorBox, Loading, Pill, useRun } from '@/components/admin/kit';
import { fmtDate } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import type { RecycleItem } from '@/lib/admin-types';

function Card({ item, onDone }: { item: RecycleItem; onDone: () => void }) {
  const { run, busy } = useRun();
  const [wiped, setWiped] = useState(false);
  const [uuReset, setUu] = useState(false);
  const [passwordChanged, setPw] = useState(false);
  return (
    <div className="q-card" style={{ gridTemplateColumns: '1fr auto' }}>
      <div>
        <h4>
          {item.code}
          <Pill tone="brand">回收中</Pill>
        </h4>
        <p className="mono">
          {item.publicIp}
          {item.lessee && ` · 原租户 ${item.lessee}`}
          {item.endedAt && ` · 租约结束 ${fmtDate(item.endedAt)}`}
          {` · 已等待 ${item.daysWaiting} 天`}
        </p>
        <div className="chk" style={{ marginTop: 12 }}>
          <Check checked={wiped} onChange={setWiped}>
            抹盘并重装系统
          </Check>
          <Check checked={uuReset} onChange={setUu}>
            重置 UU 远程
          </Check>
          <Check checked={passwordChanged} onChange={setPw}>
            更换 macOS 密码
          </Check>
        </div>
      </div>
      <button
        className="btn btn-primary"
        disabled={busy || !wiped || !uuReset || !passwordChanged}
        onClick={async () => {
          const r = await run(
            () =>
              api(`/admin/recycle/${item.deviceId}/complete`, {
                body: { wiped: true, uuReset: true, passwordChanged: true },
              }),
            `${item.code} 已回到空闲，旧凭证已作废`,
          );
          if (r !== undefined) onDone();
        }}
      >
        完成回收
      </button>
    </div>
  );
}

export default function RecyclePage() {
  const { reloadCounts } = useAdmin();
  const { data, error, loading, reload } = useApi<RecycleItem[]>('/admin/recycle');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox error={error} />;
  return (
    <>
      <div className="note-tip">
        租期结束 + 3
        天宽限期后进入回收。三项清单全部完成后，机器才会回到「空闲」可再次出租，原凭证同时作废。
      </div>
      {data.map((i) => (
        <Card
          key={i.deviceId}
          item={i}
          onDone={() => {
            void reload();
            reloadCounts();
          }}
        />
      ))}
      {data.length === 0 && (
        <div className="box empty">
          <b>没有待回收的机器</b>
        </div>
      )}
    </>
  );
}
