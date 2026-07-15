import type { SxProps, Theme } from '@mui/material/styles';

/**
 * Expands a control's tappable area to the WCAG/Material 44x44px touch-target
 * minimum via an invisible, centered pseudo-element, without inflating the
 * control's own visual size. Spread onto the `sx` prop of any MUI Checkbox
 * or IconButton that renders smaller than 44px (e.g. `size="small"`) so
 * dense layouts keep their compact look while still passing a touch-target
 * audit. Requires the target to participate in normal position layout
 * (not already `position: fixed`).
 */
export const touchTarget44: SxProps<Theme> = {
  position: 'relative',
  '&::after': {
    content: '""',
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 44,
    height: 44,
  },
};
