/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HexBoard } from '../src/components/HexBoard';

// Мокаємо мережевий шар так, щоб "онлайн" увімкнувся та прийшов стан із absorb
jest.mock('../src/api', () => {
  const baseState = {
    dice: [],                 // мінімум, аби все рендерилось
    currentPlayer: 'red',
    selected: undefined,
    gameOver: undefined as any,
  };

  return {
    ensureBackendAwake: jest.fn(async () => {}),
    // Створення гри: без absorb
    apiCreateGame: jest.fn(async () => ({
      id: 'g1',
      state: { ...baseState },
      version: 1,
      players: { red: false, blue: false },
    })),

    // Join: залежно від бажаного слоту повертаємо absorb.defender
    apiJoinGame: jest.fn(async (_id: string, want?: 'red' | 'blue') => {
      const defender = want === 'blue' ? 'blue' : 'blue'; // захисником зробимо BLUE
      return {
        ok: true as const,
        id: 'g1',
        slot: want ?? 'red',
        token: 't1',
        version: 2,
        state: {
          ...baseState,
          // абсорб активний і виконує його BLUE
          absorb: {
            defender,
            remaining: 3,
            captured: 3,
            draft: [],
            tieLock: false,
            userChoice: false,
          },
        },
      };
    }),

    // У тесті підписка не потрібна
    apiSubscribe: jest.fn(() => () => {}),
    // Дії не викликаємо
    apiAction: jest.fn(async () => ({ status: 200, data: { ok: true, state: {}, version: 3 } })),
  };
});

describe('LeftPanelAbsorb visibility (online)', () => {
  test('атакер НЕ бачить панель розподілу (slot !== absorb.defender)', async () => {
    render(<HexBoard />);

    // "Стати" RED (атакер у нашій симуляції, бо defender=BLUE)
    fireEvent.click(screen.getByText('Create (Red)'));

    // Чекаємо застосування стану після join
    await waitFor(() => {
      // Панелі з заголовком "Поглинання — команда ..." НЕ має бути
      expect(screen.queryByText(/Поглинання — команда/i)).toBeNull();
    });
  });

  test('захисник БАЧИТЬ панель розподілу (slot === absorb.defender)', async () => {
    render(<HexBoard />);

    // "Стати" BLUE (він же defender у нашій симуляції)
    fireEvent.click(screen.getByText('Create (Blue)'));

    // Має зʼявитися заголовок панелі
    expect(await screen.findByText(/Поглинання — команда blue/i)).toBeTruthy();
  });
});
