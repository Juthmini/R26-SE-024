// react-native-svg has no native side in Jest: shapes become plain views.
const React = require('react');
const { View } = require('react-native');

const Svg = (props) => React.createElement(View, props, props.children);
const Circle = (props) => React.createElement(View, props);

module.exports = { __esModule: true, default: Svg, Svg, Circle };
