// COMPONENT TESTS - DifficultyBadge
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { DifficultyBadge } from '@/src/components/patient/cognitive/components/games/DifficultyBadge';

describe('DifficultyBadge', () => {
  test('CT-FE-01 shows "Easy" for the easy level', () => {
    render(<DifficultyBadge difficulty="easy" />);
    expect(screen.getByText('Easy')).toBeTruthy();
  });

  test('CT-FE-02 shows "Medium" for the medium level', () => {
    render(<DifficultyBadge difficulty="medium" size="sm" />);
    expect(screen.getByText('Medium')).toBeTruthy();
  });

  test('CT-FE-03 shows "Hard" for the hard level and shows only that label', () => {
    render(<DifficultyBadge difficulty="hard" />);
    expect(screen.getByText('Hard')).toBeTruthy();
    expect(screen.queryByText('Easy')).toBeNull();
    expect(screen.queryByText('Medium')).toBeNull();
  });
});
