import { calcPrice, formatYuan } from '@nyd/shared';
import { Button } from '@/components/ui/Button';

export default function Home() {
  const y = calcPrice('m12', 1);
  return (
    <main className="mx-auto max-w-[1240px] px-10 py-24">
      <h1 className="text-5xl font-semibold">南洋桌面</h1>
      <p className="mt-4 text-ink2">
        年付 {formatYuan(y.unitMonthlyCents)}/月，比月付省 {formatYuan(y.savedCents)}
      </p>
      <div className="mt-8">
        <Button>选择套餐</Button>
      </div>
    </main>
  );
}
