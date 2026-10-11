// COMPONENT TESTS - banner shown after a game when the adaptive engine moves the level
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DifficultyChangeBanner } from '@/src/components/patient/cognitive/components/games/shared/DifficultyChangeBanner';
import { DifficultyProgressUpdate } from '@/src/types/games.types';

const progress = (o: Partial<DifficultyProgressUpdate> = {}): DifficultyProgressUpdate => ({
  gameId: 'memory_recall',
  previousDifficulty: 'medium',
  difficulty: 'hard',
  changed: true,
  reason: 'Great progress - your last 3 games averaged 90%.',
  compositeScore: 92,
  totalSessions: 3,
  recentScores: [88, 90, 92],
  ...o,
});

describe('DifficultyChangeBanner', () => {
  test('CT-FE-04 renders nothing when there is no progress update (save failed or offline)', () => {
    render(<DifficultyChangeBanner progress={null} />);
    expect(screen.queryByText('Difficulty increased!')).toBeNull();
    expect(screen.queryByText('Difficulty adjusted')).toBeNull();
  });

  test('CT-FE-05 renders nothing when the level did not change', () => {
    render(<DifficultyChangeBanner progress={progress({ changed: false, difficulty: 'medium' })} />);
    expect(screen.queryByText('Difficulty increased!')).toBeNull();
    expect(screen.queryByText('Difficulty adjusted')).toBeNull();
  });

  test('CT-FE-06 a level-up shows "Difficulty increased!", the old and new level and the reason', () => {
    render(<DifficultyChangeBanner progress={progress()} />);
    expect(screen.getByText('Difficulty increased!')).toBeTruthy();
    expect(screen.getByText('Medium')).toBeTruthy();
    expect(screen.getByText('Hard')).toBeTruthy();
    expect(screen.getByText('Great progress - your last 3 games averaged 90%.')).toBeTruthy();
    expect(screen.getByText('⬆️')).toBeTruthy();
  });

  test('CT-FE-07 a level-down is worded gently ("Difficulty adjusted") with a down arrow', () => {
    render(
      <DifficultyChangeBanner
        progress={progress({
          previousDifficulty: 'hard',
          difficulty: 'medium',
          reason: 'We eased the level to help you keep succeeding.',
        })}
      />,
    );
    expect(screen.getByText('Difficulty adjusted')).toBeTruthy();
    expect(screen.queryByText('Difficulty increased!')).toBeNull();
    expect(screen.getByText('⬇️')).toBeTruthy();
    expect(screen.getByText('We eased the level to help you keep succeeding.')).toBeTruthy();
  });
});
