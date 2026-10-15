// COMPONENT TESTS - AI Coach card (what the caregiver sees on screen)
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { AiCoachCard } from '../../../src/components/caregiver/insights/AiCoachCard';

describe('AiCoachCard', () => {
  test('CT-FE-01 shows the personal message when the AI replied', () => {
    render(<AiCoachCard loading={false} message="You are doing a great job. Rest tonight." />);
    expect(screen.getByText('A note from your AI coach')).toBeTruthy();
    expect(screen.getByText('You are doing a great job. Rest tonight.')).toBeTruthy();
  });

  test('CT-FE-02 shows a "writing" loading state while waiting', () => {
    render(<AiCoachCard loading={true} message={null} />);
    expect(screen.getByText('Writing something just for you...')).toBeTruthy();
  });

  test('CT-FE-03 hides itself completely when the AI is unavailable (safe fallback)', () => {
    const { toJSON } = render(<AiCoachCard loading={false} message={null} />);
    expect(toJSON()).toBeNull();
  });

  test('CT-FE-04 does not show the message text while loading', () => {
    render(<AiCoachCard loading={true} message="old text" />);
    expect(screen.queryByText('old text')).toBeNull();
  });
});
