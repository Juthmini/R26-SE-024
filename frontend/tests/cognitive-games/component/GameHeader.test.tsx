// COMPONENT TESTS - GameHeader (title, difficulty badge, back button, countdown)
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { GameHeader } from '@/src/components/patient/cognitive/components/games/shared/GameHeader';

const { __router: router } = require('expo-router');

describe('GameHeader', () => {
  test('CT-FE-08 shows the game title and the current difficulty badge', () => {
    render(<GameHeader title="Memory Recall" difficulty="medium" />);
    expect(screen.getByText('Memory Recall')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
  });

  test('CT-FE-09 the back button calls onBack (or onExit), and falls back to router.back()', () => {
    const onBack = jest.fn();
    const { unmount } = render(<GameHeader title="Go/No-Go" difficulty="easy" onBack={onBack} />);
    fireEvent.press(screen.getByText('x'));
    expect(onBack).toHaveBeenCalledTimes(1);
    unmount();

    const onExit = jest.fn();
    const second = render(<GameHeader title="Go/No-Go" difficulty="easy" onExit={onExit} onBack={onBack} />);
    fireEvent.press(screen.getByText('x'));
    expect(onExit).toHaveBeenCalledTimes(1); // onExit wins over onBack
    second.unmount();

    render(<GameHeader title="Go/No-Go" difficulty="easy" />);
    fireEvent.press(screen.getByText('x'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  test('CT-FE-10 shows the countdown only for timed games (ring label with a total, "<n>s" without)', () => {
    const untimed = render(<GameHeader title="Photo Puzzle" difficulty="easy" timeLeft={null} />);
    expect(screen.queryByText(/\ds$/)).toBeNull();
    untimed.unmount();

    const pill = render(<GameHeader title="Word Puzzle" difficulty="hard" timeLeft={25} />);
    expect(screen.getByText('25s')).toBeTruthy();
    pill.unmount();

    render(<GameHeader title="Word Puzzle" difficulty="hard" timeLeft={25} totalSeconds={60} />);
    expect(screen.getByText('25')).toBeTruthy(); // circular ring shows the bare number
    expect(screen.queryByText('25s')).toBeNull();
  });
});
