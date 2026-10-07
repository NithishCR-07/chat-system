/** @type {import('next').NextConfig} */
const nextConfig = {
  reactCompiler: true,
  // Enable network access across devices and local IPs without Server Action CSRF blocking
  experimental: {
    serverActions: {
      allowedOrigins: [
        'localhost:3000',
        '127.0.0.1:3000',
        '192.168.1.45:3000',
        '192.168.1.45',
      ],
    },
  },
};

export default nextConfig;
