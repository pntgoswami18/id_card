import { useEffect, useRef, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { AppStateProvider, useAppDispatch } from './store/AppStateContext';
import type { WorkspaceData } from './utils/workspaceStorage';

/**
 * AppStateProvider hardcodes `initialState` with no prop to inject a custom
 * starting state, so tests seed via a single LOAD_WORKSPACE_STATE dispatch
 * (covers every field a test is likely to need) fired from an effect on mount
 * — dispatching during render itself would update an ancestor's state mid-render,
 * which React does not support outside of a component adjusting its own state.
 */
// eslint-disable-next-line react-refresh/only-export-components -- test helper, not app source; Fast Refresh doesn't apply.
function Seed({ payload }: { payload: Partial<WorkspaceData> }) {
  const dispatch = useAppDispatch();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    dispatch({ type: 'LOAD_WORKSPACE_STATE', payload });
  }, [dispatch, payload]);
  return null;
}

/**
 * Renders `children` inside a real AppStateProvider, optionally seeded with
 * `initialState` (any subset of WorkspaceData) before the first assertion.
 * Because seeding happens in an effect, tests must use `find*` queries or
 * `waitFor` for content that depends on the seeded state — a synchronous
 * `getBy*` right after render will see the provider's default `initialState`.
 */
export function renderWithAppState(
  ui: ReactNode,
  { initialState }: { initialState?: Partial<WorkspaceData> } = {},
): RenderResult {
  return render(
    <AppStateProvider>
      {initialState && <Seed payload={initialState} />}
      {ui}
    </AppStateProvider>,
  );
}
