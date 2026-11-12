const API = process.env.API_URL ?? 'http://localhost:4000';

/** @type {import('next').NextConfig} */
export default {
  transpilePackages: ['@nyd/shared'],
  // 代码检查由仓库根目录的 ESLint 统一负责
  eslint: { ignoreDuringBuilds: true },
  // 浏览器只访问同一个域名：/api 与 /uploads 由 Next 转发给后端，这样 Cookie 不需要跨域
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${API}/api/:path*` },
      { source: '/uploads/:path*', destination: `${API}/uploads/:path*` },
    ];
  },
};
