import type { NextConfig } from 'next';
import path from 'path'

const nextConfig: NextConfig = {
  output: 'standalone',
  reactCompiler: true,
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'image.tmdb.org' }]
  },
  turbopack: {
    root: path.join(__dirname)
  }
}

export default nextConfig;
