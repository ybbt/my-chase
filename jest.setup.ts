// jest.setup.ts
import '@testing-library/jest-dom';

// Поліфіл для Node/Jest, де нема globalThis.structuredClone
if (typeof (globalThis as any).structuredClone !== 'function') {
  (globalThis as any).structuredClone = (value: any) =>
    JSON.parse(JSON.stringify(value));
}