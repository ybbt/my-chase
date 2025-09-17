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

    await waitFor(() => {
      expect(screen.queryByText(/Поглинання — команда/i)).toBeNull();
    });
  });

  test('захисник (slot === defender) БАЧИТЬ панель', async () => {
    render(<HexBoard />);

    // Приєднуємось як BLUE — саме він defender у моку
    fireEvent.click(screen.getByText('Create (Blue)'));

    expect(await screen.findByText(/Поглинання — команда blue/i)).toBeTruthy();
  });
});
