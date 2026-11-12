'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

const Ctx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState('');
  const [on, setOn] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((m: string) => {
    setMsg(m);
    setOn(true);
    clearTimeout(t.current);
    t.current = setTimeout(() => setOn(false), 2200);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className={`toast${on ? ' on' : ''}`} role="status" aria-live="polite">
        {msg}
      </div>
    </Ctx.Provider>
  );
}

/** 复制到剪贴板并提示 */
export function useCopy() {
  const toast = useToast();
  return useCallback(
    (text: string, msg = '已复制') => {
      const done = () => toast(msg);
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, fallback);
      else fallback();
      function fallback() {
        const a = document.createElement('textarea');
        a.value = text;
        document.body.appendChild(a);
        a.select();
        try {
          document.execCommand('copy');
        } catch {
          /* 忽略 */
        }
        a.remove();
        done();
      }
    },
    [toast],
  );
}
