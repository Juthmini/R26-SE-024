// Icons are just pictures; in tests they are replaced by an empty box so no font loading happens.
const React = require('react');
const { View } = require('react-native');
const Icon = (props) => React.createElement(View, { testID: `icon-${props.name}` });
module.exports = new Proxy({ __esModule: true }, { get: (t, k) => (k === '__esModule' ? true : Icon) });
