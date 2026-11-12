'use client';

/** 打开右下角的客服弹窗（SupportFab 的按钮是唯一入口，这里直接触发它） */
export const openSupport = () => document.querySelector<HTMLButtonElement>('.fab')?.click();

export function SupportLink({ children = '联系客服' }: { children?: React.ReactNode }) {
  return (
    <a
      className="link"
      href="#"
      onClick={(e) => {
        e.preventDefault();
        openSupport();
      }}
    >
      {children}
    </a>
  );
}
