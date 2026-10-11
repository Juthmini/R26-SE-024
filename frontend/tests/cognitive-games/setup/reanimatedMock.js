// Replaces react-native-reanimated during tests: animations become plain views,
// animation helpers become no-ops, and `entering={FadeIn.delay(1).duration(2)}`
// style chains are accepted and ignored.
const React = require('react');
const { View, Text } = require('react-native');

const chain = new Proxy(function chainTarget() {}, {
  get: () => chain,
  apply: () => chain,
});

const AnimatedView = React.forwardRef((props, ref) => React.createElement(View, { ...props, ref }));
const AnimatedText = React.forwardRef((props, ref) => React.createElement(Text, { ...props, ref }));

module.exports = {
  __esModule: true,
  default: {
    View: AnimatedView,
    Text: AnimatedText,
    createAnimatedComponent: (Component) => Component,
  },
  useSharedValue: (initial) => ({ value: initial }),
  useAnimatedStyle: () => ({}),
  useAnimatedProps: () => ({}),
  withTiming: (value) => value,
  withDelay: (_delay, value) => value,
  withRepeat: (value) => value,
  withSequence: (...values) => values[values.length - 1],
  Easing: chain,
  FadeIn: chain,
  FadeInUp: chain,
  FadeInDown: chain,
  FadeInRight: chain,
  FadeOut: chain,
  ZoomIn: chain,
};
