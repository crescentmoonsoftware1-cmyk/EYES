/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', '10.94.213.159', '192.168.1.15', 'localhost'],
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
