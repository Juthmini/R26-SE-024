// COMPONENT TESTS - Burnout risk card
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { BurnoutCard } from '../../../src/components/caregiver/insights/BurnoutCard';

const burnout = (o: any = {}) => ({
  riskScore: 81, riskLevel: 'High', trend: 'worsening',
  forecast: 'Burnout is likely within 7 days if current patterns continue.',
  factors: [{ factor: 'Sleep deprivation', severity: 'high', description: 'Average 4.0 hours sleep (need 7+)', icon: 'moon' }],
  daysAnalyzed: 3, ...o,
});

describe('BurnoutCard', () => {
  test('CT-FE-15 shows the score and the risk label for High risk', () => {
    render(<BurnoutCard burnout={burnout() as any} />);
    expect(screen.getByText('81')).toBeTruthy();
    expect(screen.getByText('High Risk')).toBeTruthy();
  });

  test('CT-FE-16 shows the "7-DAY BURNOUT FORECAST" heading and how many days were analysed', () => {
    render(<BurnoutCard burnout={burnout() as any} />);
    expect(screen.getByText('7-DAY BURNOUT FORECAST')).toBeTruthy();
    expect(screen.getByText(/Based on 3 days of data/)).toBeTruthy();
  });

  test.each([['Low', 'Low Risk'], ['Moderate', 'Moderate Risk'], ['High', 'High Risk']])(
    'CT-FE-17 risk level %s shows label "%s"', (riskLevel, label) => {
      render(<BurnoutCard burnout={burnout({ riskLevel }) as any} />);
      expect(screen.getByText(label)).toBeTruthy();
    });

  test('CT-FE-18 risk factors are hidden until the card is tapped open', () => {
    render(<BurnoutCard burnout={burnout() as any} />);
    expect(screen.queryByText('Sleep deprivation')).toBeNull();
    fireEvent.press(screen.getByText('High Risk'));
    expect(screen.getByText('Sleep deprivation')).toBeTruthy();
  });
});