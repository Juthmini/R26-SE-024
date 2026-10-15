// COMPONENT TESTS - GameResultScreen (shown after every game)
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { GameResultScreen } from '@/src/components/patient/cognitive/components/games/shared/GameResultScreen';
import { GAME_CONFIGS } from '@/src/constants/games';
import { DifficultyProgressUpdate, GameSessionResult } from '@/src/types/games.types';

const { __router: router } = require('expo-router');

const result = (o: Partial<GameSessionResult> = {}): GameSessionResult => ({
  gameId: 'memory_recall',
  difficulty: 'medium',
  score: 7,
  maxScore: 10,
  timeTakenSeconds: 42,
  completedAt: new Date().toISOString(),
  correctAnswers: 7,
  totalAnswers: 10,
  ...o,
});

const levelUp: DifficultyProgressUpdate = {
  gameId: 'memory_recall',
  previousDifficulty: 'medium',
  difficulty: 'hard',
  changed: true,
  reason: 'Great progress!',
  compositeScore: 91,
  totalSessions: 3,
  recentScores: [88, 90, 91],
};

describe('GameResultScreen', () => {
  test('CT-FE-16 a score of 60% or more celebrates: "Well done!", "Passed", score, time and accuracy', () => {
    render(<GameResultScreen result={result()} onPlayAgain={jest.fn()} />);
    expect(screen.getByText('Well done!')).toBeTruthy();
    expect(screen.getByText('✓ Passed')).toBeTruthy();
    expect(screen.getByText('7/10')).toBeTruthy();
    expect(screen.getByText('42s')).toBeTruthy();
    expect(screen.getByText('70%')).toBeTruthy();
    expect(screen.getByText(`${GAME_CONFIGS.memory_recall.title} · Medium`)).toBeTruthy();
  });

  test('CT-FE-17 a score below 60% is encouraging, not discouraging: "Keep trying!" / "Not passed yet"', () => {
    render(<GameResultScreen result={result({ score: 3, correctAnswers: 3 })} onPlayAgain={jest.fn()} />);
    expect(screen.getByText('Keep trying!')).toBeTruthy();
    expect(screen.getByText('Not passed yet')).toBeTruthy();
    expect(screen.queryByText('Well done!')).toBeNull();
    expect(screen.queryByText('Failed')).toBeNull();
  });

  test('CT-FE-18 Play Again calls onPlayAgain once, then shows "Preparing…" and ignores double taps', () => {
    const onPlayAgain = jest.fn();
    render(<GameResultScreen result={result()} onPlayAgain={onPlayAgain} />);
    fireEvent.press(screen.getByText('Play Again'));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Preparing…')).toBeTruthy();
    fireEvent.press(screen.getByText('Preparing…'));
    expect(onPlayAgain).toHaveBeenCalledTimes(1);
  });

  test('CT-FE-19 Back to Games calls onBack, or goes to /patient/games when none is given', () => {
    const onBack = jest.fn();
    const first = render(<GameResultScreen result={result()} onPlayAgain={jest.fn()} onBack={onBack} />);
    fireEvent.press(screen.getByText('Back to Games'));
    expect(onBack).toHaveBeenCalledTimes(1);
    first.unmount();

    render(<GameResultScreen result={result()} onPlayAgain={jest.fn()} />);
    fireEvent.press(screen.getByText('Back to Games'));
    expect(router.replace).toHaveBeenCalledWith('/patient/games');
  });

  test('CT-FE-20 shows the difficulty-change banner only when the level actually changed', () => {
    const changed = render(<GameResultScreen result={result()} onPlayAgain={jest.fn()} progress={levelUp} />);
    expect(screen.getByText('Difficulty increased!')).toBeTruthy();
    expect(screen.getByText('Great progress!')).toBeTruthy();
    changed.unmount();

    render(
      <GameResultScreen
        result={result()}
        onPlayAgain={jest.fn()}
        progress={{ ...levelUp, changed: false, difficulty: 'medium' }}
      />,
    );
    expect(screen.queryByText('Difficulty increased!')).toBeNull();
    expect(screen.queryByText('Difficulty adjusted')).toBeNull();
  });
});
