import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  roots: ['<rootDir>'],
  moduleNameMapper: {
    // якщо в проєкті є alias типу "@/...", додай мапінги тут
  },
  verbose: true,
};

export default config;
