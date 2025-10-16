// // jest.config.ts
// import type { Config } from 'jest';

// const config: Config = {
//   preset: 'ts-jest',
//   testEnvironment: 'node',
//   testMatch: ['**/__tests__/**/*.test.ts?(x)'],
//   moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
//   moduleNameMapper: {
//     '^(\\.{1,2}/.*)\\.js$': '$1', // щоб імпорти виду ./Foo.js мапились на .ts у тестах
//   },
//   transform: {
//     '^.+\\.(ts|tsx)$': [
//       'ts-jest',
//       {
//         tsconfig: {
//           jsx: 'react-jsx',                 // увімкнути JSX для тестів
//           esModuleInterop: true,            // дозволити default-імпорт React
//           allowSyntheticDefaultImports: true
//         }
//       }
//     ],
//   },
//   setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
//   verbose: true,
// };

// export default config;

// jest.config.ts
import type { Config } from 'jest';

const common: Partial<Config> = {
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // Мапимо TS-alias + знімаємо .js-суфікси для TS-файлів
  moduleNameMapper: {
    '^@engine/(.*)$': '<rootDir>/shared/engine/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: {
          jsx: 'react-jsx',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
        },
      },
    ],
  },
  verbose: true,
};

const config: Config = {
  // Два середовища: jsdom для UI, node для решти
  projects: [
    {
      displayName: 'ui',
      testEnvironment: 'jsdom',
      // UI-тести
      testMatch: ['**/__tests__/**/*.test.tsx'],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
      ...common,
    },
    {
      displayName: 'node',
      testEnvironment: 'node',
      // Усе, що НЕ .tsx (engine, server)
      testMatch: ['**/__tests__/**/*.test.ts', '!**/*.test.tsx'],
      ...common,
    },
  ],
};

export default config;

