// Replaces the animation library during tests: animations become plain views.
const React = require('react');
const { View } = require('react-native');
const chain = new Proxy({}, { get: () => () => chain });
module.exports = {
  __esModule: true,
  default: { View: (props) => React.createElement(View, props) },
  FadeInUp: chain, FadeInDown: chain, FadeIn: chain, FadeOut: chain,
};
