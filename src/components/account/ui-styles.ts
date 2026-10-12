// Material 3 class lists shared by the account pages (they render plain elements, not MUI, so server markup and
// hydration stay light): a tonal section surface, outlined and filled common buttons, outlined text fields.
export const accountSection = "md3-surface p-4 sm:p-6 md:p-8";
export const accountButton = "md3-state inline-flex h-10 items-center justify-center gap-2 rounded-full border border-outline-variant px-6 text-label-large text-primary transition-colors disabled:cursor-not-allowed disabled:border-on-surface/12 disabled:text-on-surface/38";
export const accountPrimary = "md3-state inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-6 text-label-large text-on-primary transition-colors disabled:cursor-not-allowed disabled:bg-on-surface/12 disabled:text-on-surface/38";
export const accountInput = "md3-text-field disabled:opacity-40";
