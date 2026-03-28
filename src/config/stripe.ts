export const STRIPE_PLANS = {
  pro: {
    name: 'Pro User',
    priceIds: {
      // TODO: Replace with your actual Test Price ID from Stripe Dashboard > Products
      test: 'price_1TFhNSPObmbp7aBT2pUont3R',
      // Currently hardcoded Live Price ID from previous code
      live: 'price_1TFglwPObmbp7aBT2ZMnOucd',
    }
  }
} as const;

export type PlanKey = keyof typeof STRIPE_PLANS;

/**
 * Helper to securely resolve the Stripe Price ID without shipping it to the client bundle.
 */
export const getPriceId = (plan: PlanKey): string => {
  // Checks if Vercel (or similar hosting) has explicitly set production mode
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    return STRIPE_PLANS[plan].priceIds.live;
  }

  return STRIPE_PLANS[plan].priceIds.test;
};
