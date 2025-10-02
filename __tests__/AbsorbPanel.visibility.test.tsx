/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HexBoard } from '../src/components/HexBoard';

// опційно: зручні матчери
// import '@testing-library/jest-dom/extend-expect';

jest.mock('../src/api', () => {
  const baseState = {
    dice: [],
    currentPlayer: 'red',
    selected: undefined,
    gameOver: undefined,
  };

  return {
    ensureBackendAwake: jest.fn(async () => {}),
    apiCreateGame: jest.fn(async () => ({
      id: 'g1',
      state: { ...baseState },
      version: 1,
      players: { red: false, blue: false },
    })),
    // absorb активний, defender = 'blue' — зручно, щоб перевірити обидва кейси
    apiJoinGame: jest.fn(async (_id: string, want?: 'red' | 'blue') => ({
      ok: true as const,
      id: 'g1',
      slot: want ?? 'red',
      token: 't1',
      version: 2,
      state: {
        ...baseState,
        absorb: {
          defender: 'blue',
          remaining: 3,
          captured: 3,
          draft: [],
          tieLock: false,
          userChoice: false,
        },
      },
    })),
    apiSubscribe: jest.fn(() => () => {}), // без реального SSE
    apiAction: jest.fn(async () => ({ status: 200, data: { ok: true } })),
  };
});

describe('Absorb panel visibility', () => {
  test('атакер (slot !== defender) НЕ бачить панель', async () => {
    render(<HexBoard />);

    // Створюємо гру і приєднуємось як RED (defender = BLUE у моку)
    fireEvent.click(screen.getByText('Create (Red)'));

    // статус у хедері має з’явитися
    // expect(await screen.findByText(/Хід суперника: розподіл балів/i)).toBeTruthy();
    expect(await screen.findByLabelText('status-wait-absorb')).toBeTruthy();
    // показуємо таймер у форматі (мм:сс)
    expect(screen.getByLabelText('wait-timer').textContent).toMatch(/^\(\d{2}:\d{2}\)$/);
    // і текст-підказку
    expect(screen.getByText(/чекаємо опонента/i)).toBeTruthy();

    await waitFor(() => {
      expect(screen.queryByText(/Поглинання — команда/i)).toBeNull();
    });
    // expect(await screen.findByText(/Хід суперника: розподіл балів/i)).toBeTruthy(); // є підказка в хедері
    expect(await screen.findByLabelText('status-wait-absorb')).toBeTruthy();
  });

  test('захисник (slot === defender) БАЧИТЬ панель', async () => {
    render(<HexBoard />);

    // Приєднуємось як BLUE — саме він defender у моку
    fireEvent.click(screen.getByText('Create (Blue)'));

    expect(await screen.findByText(/Поглинання — команда blue/i)).toBeTruthy();
  });
});
