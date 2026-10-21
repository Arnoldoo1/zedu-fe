/**
 * The 3D office is behind a feature flag so it can be switched on per
 * deployment. It is read at build time because NEXT_PUBLIC_* values are
 * inlined into the client bundle.
 */
export const OFFICE_ENABLED = process.env.NEXT_PUBLIC_FF_3D_OFFICE === "true";
