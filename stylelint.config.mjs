export default {
  plugins: ['@projectwallace/stylelint-plugin'],
  rules: {
    'block-no-empty': true,
    'color-no-invalid-hex': true,
    'declaration-block-no-duplicate-properties': true,
    'no-duplicate-selectors': true,
    'projectwallace/max-lines-of-code': [1000, { severity: 'error' }],
    'projectwallace/max-selector-complexity': [15, { severity: 'error' }],
    'selector-max-specificity': ['0,4,0', { severity: 'error' }],
  },
}
