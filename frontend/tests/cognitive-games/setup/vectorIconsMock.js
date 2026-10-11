// Icons are just pictures; in tests they become an empty box (testID "icon-<name>")
// so no font loading happens.
const React = require('react');
const { View } = require('react-native');

const Icon = (props) => React.createElement(View, { testID: `icon-${props.name}` });
module.exports = new Proxy({ __esModule: true }, { get: (_t, key) => (key === '__esModule' ? true : Icon) });
