// COMPONENT TESTS - Notification card + summary bar
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { NotificationCard } from '../../../src/components/caregiver/more/notifications/NotificationCard';
import { NotificationSummaryBar } from '../../../src/components/caregiver/more/notifications/NotificationSummaryBar';

const notif = (o: any = {}) => ({ id: 'n1', patientName: 'System', message: 'Your burnout risk is High (82/100).', time: '2m ago', severity: 'urgent' as const, acknowledged: false, ...o });

describe('NotificationCard', () => {
  test('CT-FE-05 shows the patient/system name, message and time', () => {
    render(<NotificationCard notification={notif()} onAcknowledge={jest.fn()} />);
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('Your burnout risk is High (82/100).')).toBeTruthy();
    expect(screen.getByText('2m ago')).toBeTruthy();
  });

  test('CT-FE-06 an unread notification shows the Acknowledge button', () => {
    render(<NotificationCard notification={notif()} onAcknowledge={jest.fn()} />);
    expect(screen.getByText('Acknowledge')).toBeTruthy();
    expect(screen.queryByText('Acknowledged')).toBeNull();
  });

  test('CT-FE-07 pressing Acknowledge calls onAcknowledge with the notification id', () => {
    jest.useFakeTimers();
    const onAck = jest.fn();
    render(<NotificationCard notification={notif()} onAcknowledge={onAck} />);
    fireEvent.press(screen.getByText('Acknowledge'));
    jest.runAllTimers();
    expect(onAck).toHaveBeenCalledWith('n1');
    jest.useRealTimers();
  });

  test('CT-FE-08 an acknowledged notification shows "Acknowledged" and no button', () => {
    render(<NotificationCard notification={notif({ acknowledged: true })} onAcknowledge={jest.fn()} />);
    expect(screen.getByText('Acknowledged')).toBeTruthy();
    expect(screen.queryByText('Acknowledge')).toBeNull();
  });

  test('CT-FE-09 shows an action button only when hasAction is true, with its label', () => {
    const onAction = jest.fn();
    render(<NotificationCard notification={notif({ hasAction: true, actionLabel: 'Open Coach' })} onAcknowledge={jest.fn()} onAction={onAction} />);
    fireEvent.press(screen.getByText('Open Coach'));
    expect(onAction).toHaveBeenCalledWith('n1');
  });

  test('CT-FE-10 no action button when hasAction is not set', () => {
    render(<NotificationCard notification={notif()} onAcknowledge={jest.fn()} />);
    expect(screen.queryByText('Take Action')).toBeNull();
  });

  test.each(['urgent', 'warning', 'info'] as const)('CT-FE-11 renders without crashing for severity "%s"', (severity) => {
    render(<NotificationCard notification={notif({ severity })} onAcknowledge={jest.fn()} />);
    expect(screen.getByText('Acknowledge')).toBeTruthy();
  });
});

describe('NotificationSummaryBar', () => {
  const counts = { urgent: 2, warning: 5, info: 1 };

  test('CT-FE-12 shows the three counts with their labels', () => {
    render(<NotificationSummaryBar counts={counts} active="all" onPress={jest.fn()} />);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('Urgent')).toBeTruthy();
    expect(screen.getByText('Warnings')).toBeTruthy();
    expect(screen.getByText('Info')).toBeTruthy();
  });

  test('CT-FE-13 pressing a filter passes its type', () => {
    const onPress = jest.fn();
    render(<NotificationSummaryBar counts={counts} active="all" onPress={onPress} />);
    fireEvent.press(screen.getByText('Warnings'));
    expect(onPress).toHaveBeenCalledWith('warning');
  });

  test('CT-FE-14 pressing the already-active filter switches back to "all"', () => {
    const onPress = jest.fn();
    render(<NotificationSummaryBar counts={counts} active="urgent" onPress={onPress} />);
    fireEvent.press(screen.getByText('Urgent'));
    expect(onPress).toHaveBeenCalledWith('all');
  });
});
