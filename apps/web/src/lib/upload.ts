import { ApiError } from './api';

/** 上传图片（管理员）：返回 /uploads/xxx.png 形式的地址 */
export async function uploadImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/admin/uploads', {
    method: 'POST',
    body: fd,
    credentials: 'same-origin',
  });
  const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok || !data.url) throw new ApiError(data.message ?? '上传失败', res.status);
  return data.url;
}
