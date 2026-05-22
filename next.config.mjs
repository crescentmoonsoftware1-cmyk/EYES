/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['127.0.0.1', '10.94.213.159', '192.168.1.15', 'localhost'],
  typescript: {
    ignoreBuildErrors: true,
  },
  // pdfkit uses __dirname to resolve .afm font files at runtime.
  // Bundling it breaks that resolution — mark it as external so Node
  // requires it natively in the Vercel serverless environment.
  serverExternalPackages: ['pdfkit'],
  outputFileTracingIncludes: {
    // Ensure AFM font files are included in the serverless bundle trace
    '/api/audit/\\[id\\]/pdf': ['./node_modules/pdfkit/js/data/**/*.afm'],
  },
};

export default nextConfig;
