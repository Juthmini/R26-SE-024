// COMPONENT TESTS - step-by-step Daily-Living Questionnaire (dementia triage FAQ)
import React from 'react';
import { act, render, screen, fireEvent } from '@testing-library/react-native';
import * as Speech from 'expo-speech';
import { FaqQuestionnaire } from '@/src/components/patient/cognitive/components/screening-test/FaqQuestionnaire';
import { FAQ_CHOICES, FAQ_ITEMS, FAQ_QUESTIONS } from '@/src/types/dementia.types';

const setup = (props: Partial<React.ComponentProps<typeof FaqQuestionnaire>> = {}) => {
  const onSubmit = jest.fn();
  const utils = render(
    <FaqQuestionnaire submitLabel="Submit & see results" submitting={false} error={null} onSubmit={onSubmit} {...props} />,
  );
  return { onSubmit, ...utils };
};

// Pick an answer by its short title, then let the auto-advance timer fire.
const answer = (title: string) => {
  fireEvent.press(screen.getByText(title));
  act(() => {
    jest.advanceTimersByTime(400);
  });
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('FaqQuestionnaire', () => {
  test('FAQ-01 starts on a friendly intro and Start opens question 1 of 10', () => {
    setup();
    expect(screen.getByText('A few simple questions')).toBeTruthy();
    expect(screen.queryByText(/Question 1 of/)).toBeNull();
    fireEvent.press(screen.getByText('Start'));
    expect(screen.getByText('Question 1 of 10')).toBeTruthy();
    expect(screen.getByText(FAQ_QUESTIONS[0].question)).toBeTruthy();
    expect(screen.getByText(FAQ_QUESTIONS[0].examples)).toBeTruthy();
  });

  test('FAQ-02 every question offers the same four plain-English answers', () => {
    setup();
    fireEvent.press(screen.getByText('Start'));
    FAQ_CHOICES.forEach((c) => {
      expect(screen.getByText(c.title)).toBeTruthy();
      expect(screen.getByText(c.detail)).toBeTruthy();
    });
  });

  test('FAQ-03 picking an answer moves on to the next question by itself', () => {
    setup();
    fireEvent.press(screen.getByText('Start'));
    answer('No problem');
    expect(screen.getByText('Question 2 of 10')).toBeTruthy();
    expect(screen.getByText(FAQ_QUESTIONS[1].question)).toBeTruthy();
  });

  test('FAQ-04 Back returns to the previous question and keeps its answer selected', () => {
    setup();
    fireEvent.press(screen.getByText('Start'));
    answer('Needs some help');
    fireEvent.press(screen.getByText('← Back'));
    expect(screen.getByText('Question 1 of 10')).toBeTruthy();
    const picked = screen.getByLabelText(/Needs some help\./);
    expect(picked.props.accessibilityState.selected).toBe(true);
  });

  test('FAQ-05 Next stays disabled until the current question is answered', () => {
    setup();
    fireEvent.press(screen.getByText('Start'));
    fireEvent.press(screen.getByText('Next →'));
    expect(screen.getByText('Question 1 of 10')).toBeTruthy(); // did not move
  });

  test('FAQ-06 "Read it to me" speaks the question, examples and all four choices; second tap stops', () => {
    setup();
    fireEvent.press(screen.getByText('Start'));
    fireEvent.press(screen.getByLabelText('Read the question aloud'));
    expect(Speech.speak).toHaveBeenCalledTimes(1);
    const spoken = (Speech.speak as jest.Mock).mock.calls[0][0] as string;
    expect(spoken).toContain(FAQ_QUESTIONS[0].question);
    FAQ_CHOICES.forEach((c) => expect(spoken).toContain(c.title));
    expect(screen.getByText('Stop')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Stop reading the question'));
    expect(Speech.stop).toHaveBeenCalled();
  });

  test('FAQ-07 after 10 answers a review screen lists them all and submits exactly the 10 model keys (0-3)', () => {
    const { onSubmit } = setup();
    fireEvent.press(screen.getByText('Start'));
    const sequence = ['No problem', 'A little harder', 'Needs some help', 'Someone else does it'];
    for (let i = 0; i < 10; i += 1) answer(sequence[i % 4]);

    expect(screen.getByText('Your answers')).toBeTruthy();
    FAQ_QUESTIONS.forEach((q) => expect(screen.getByText(q.title)).toBeTruthy());

    fireEvent.press(screen.getByText('Submit & see results'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const submitted = onSubmit.mock.calls[0][0];
    expect(Object.keys(submitted).sort()).toEqual([...FAQ_ITEMS].sort());
    expect(FAQ_ITEMS.map((k) => submitted[k])).toEqual([0, 1, 2, 3, 0, 1, 2, 3, 0, 1]);
  });

  test('FAQ-08 from the review screen an answer can be changed and it returns straight to the review', () => {
    const { onSubmit } = setup();
    fireEvent.press(screen.getByText('Start'));
    for (let i = 0; i < 10; i += 1) answer('No problem');

    fireEvent.press(screen.getByLabelText(new RegExp(`^${FAQ_QUESTIONS[2].title}:`)));
    expect(screen.getByText('Question 3 of 10')).toBeTruthy();
    answer('Someone else does it');
    expect(screen.getByText('Your answers')).toBeTruthy();

    fireEvent.press(screen.getByText('Submit & see results'));
    expect(onSubmit.mock.calls[0][0].shopping).toBe(3);
    expect(onSubmit.mock.calls[0][0].bills).toBe(0);
  });

  test('FAQ-09 while saving the submit button is busy, and a save error is shown in plain words', () => {
    const busy = setup({ submitting: true });
    fireEvent.press(screen.getByText('Start'));
    for (let i = 0; i < 10; i += 1) answer('No problem');
    expect(screen.queryByText('Submit & see results')).toBeNull(); // replaced by a spinner
    busy.unmount();

    setup({ error: 'Could not save the questionnaire. Try again.' });
    fireEvent.press(screen.getByText('Start'));
    for (let i = 0; i < 10; i += 1) answer('No problem');
    expect(screen.getByText('Could not save the questionnaire. Try again.')).toBeTruthy();
  });

  test('FAQ-10 the Close button appears only when onClose is supplied (modal use) and calls it', () => {
    const first = setup();
    expect(screen.queryByLabelText('Close questionnaire')).toBeNull();
    first.unmount();

    const onClose = jest.fn();
    setup({ onClose });
    fireEvent.press(screen.getByLabelText('Close questionnaire'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
