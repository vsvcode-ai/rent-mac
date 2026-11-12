'use client';
import { useEffect } from 'react';

/** admin.css 里有 body.adm 的样式，进入后台时给 body 加上，离开时去掉 */
export function BodyClass({ name }: { name: string }) {
  useEffect(() => {
    document.body.classList.add(name);
    return () => document.body.classList.remove(name);
  }, [name]);
  return null;
}
