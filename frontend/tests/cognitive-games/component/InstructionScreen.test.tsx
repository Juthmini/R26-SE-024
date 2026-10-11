// COMPONENT TESTS - InstructionScreen (the "how to play" page before every game)
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import { InstructionScreen } from '@/src/components/patient/cognitive/components/games/shared/InstructionScreen';
import { GAME_CONFIGS } from '@/src/constants/games';

const { __router: router } = require('expo-router');

const steps = [
  { icon: '👀', text: 'Watch the pictures carefully' },
  { icon: '👆', text: 'Tap the ones you saw' },
  { icon: '⭐', text: 'Earn a star for each right answer' },
];

const setup = (props: Partial<React.ComponentProps<typeof InstructionScreen>> = {}) => {
  const onStart = jest.fn();
  const utils = render(
    <InstructionScreen gameId="memory_recall" difficulty="easy" steps={steps} onStart={onStart} {...props} />,
  );
  return { onStart, ...utils };
};

describe('InstructionScreen', () => {
  test('CT-FE-11 shows the game title, description and every numbered step', () => {
    setup();
    const cfg = GAME_CONFIGS.memory_recall;
    expect(screen.getByText(cfg.title)).toBeTruthy();
    expect(screen.getByText(cfg.description)).toBeTruthy();
    steps.forEach((s, i) => {
      expect(screen.getByText(s.text)).toBeTruthy();
      expect(screen.getByText(String(i + 1))).toBeTruthy();
    });
    expect(screen.getByText('How to play')).toBeTruthy();
  });

  test('CT-FE-12 pressing Start calls onStart and stops any speech', () => {
    const { onStart } = setup();
    fireEvent.press(screen.getByText('Start Game'));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(Speech.stop).toHaveBeenCalled();
  });

  test('CT-FE-13 while content is loading the Start button is disabled and shows the custom label', () => {
    const { onStart } = setup({ startDisabled: true, startLabel: 'Preparing your game…' });
    expect(screen.queryByText('Start Game')).toBeNull();
    fireEvent.press(screen.getByText('Preparing your game…'));
    expect(onStart).not.toHaveBeenCalled();
  });

  test('CT-FE-14 "Listen to Instructions" reads the title and steps aloud, then toggles to "Stop"', () => {
    setup();
    fireEvent.press(screen.getByLabelText('Listen to instructions'));
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    const spoken = (Speech.speak as jest.Mock).mock.calls[0][0] as string;
    expect(spoken).toContain(GAME_CONFIGS.memory_recall.title);
    expect(spoken).toContain('Step 1. Watch the pictures carefully');
    expect(spoken).toContain('Step 3. Earn a star for each right answer');

    expect(screen.getByText('Stop Instructions')).toBeTruthy();
    (Speech.stop as jest.Mock).mockClear();
    fireEvent.press(screen.getByLabelText('Stop listening to instructions'));
    expect(Speech.stop).toHaveBeenCalled();
    expect(screen.getByText('Listen to Instructions')).toBeTruthy();
  });

  test('CT-FE-15 Back calls onBack (else router.back) and the optional secondary action works', () => {
    const onBack = jest.fn();
    const onSecondary = jest.fn();
    const first = setup({ onBack, secondaryAction: { label: 'Open Family Album', onPress: onSecondary } });
    fireEvent.press(screen.getByText('← Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('Open Family Album'));
    expect(onSecondary).toHaveBeenCalledTimes(1);
    first.unmount();

    setup(); // no onBack supplied and no secondary action
    expect(screen.queryByText('Open Family Album')).toBeNull();
    fireEvent.press(screen.getByText('← Back'));
    expect(router.back).toHaveBeenCalledTimes(1);
  });
});
