/*
 * Everything about buying, in one place. Change it here and both the app and
 * the landing page's FAQ stay consistent.
 */
export const BUY = {
  price: '$19',

  /* Cash App cashtag money is sent to. Verify this link opens YOUR account
     before advertising it — a typo sends customers' money to a stranger. */
  cashtag: '$Ahmirp1961',
  cashAppUrl: 'https://cash.app/$Ahmirp1961',

  /* Preferred when set: a Square or Stripe checkout link, which takes cards and
     wallets properly and can still deposit into Cash App. See docs/PAYMENTS.md.
     Leave empty to send buyers straight to Cash App. */
  checkoutUrl: '',

  /* Where buyers reach you for their code. Leave empty to hide the line. */
  contactEmail: '',
};

/** The link the buy buttons should use. */
export function buyUrl() {
  return BUY.checkoutUrl || BUY.cashAppUrl;
}
