import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // shared는 빌드 없이 TS 소스를 그대로 가져다 쓰므로 Next가 트랜스파일하도록 지정
  transpilePackages: ['@ai-mafia/shared'],
};

export default nextConfig;
