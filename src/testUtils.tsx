import { useEffect, useRef, type ReactNode } from 'react';
import { render, type RenderResult } from '@testing-library/react';
import { AppStateProvider, useAppDispatch } from './store/AppStateContext';
import type { AppState } from './store/appState';
import type { WorkspaceData } from './utils/workspaceStorage';

/**
 * `currentWorkspaceId`/`workspaceList` live on AppState but are NOT part of
 * WorkspaceData (they're workspace-switcher UI state, set via their own
 * SET_CURRENT_WORKSPACE/SET_WORKSPACE_LIST actions, not persisted per-workspace)
 * — LOAD_WORKSPACE_STATE silently ignores them if passed in its payload.
 */
type SeedState = Partial<WorkspaceData> & Partial<Pick<AppState, 'currentWorkspaceId' | 'workspaceList'>>;

/**
 * AppStateProvider hardcodes `initialState` with no prop to inject a custom
 * starting state, so tests seed via a small number of dispatches (covers every
 * field a test is likely to need) fired from an effect on mount — dispatching
 * during render itself would update an ancestor's state mid-render, which React
 * does not support outside of a component adjusting its own state.
 */
// eslint-disable-next-line react-refresh/only-export-components -- test helper, not app source; Fast Refresh doesn't apply.
function Seed({ payload }: { payload: SeedState }) {
  const dispatch = useAppDispatch();
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const { currentWorkspaceId, workspaceList, ...workspaceData } = payload;
    dispatch({ type: 'LOAD_WORKSPACE_STATE', payload: workspaceData });
    if (currentWorkspaceId !== undefined) dispatch({ type: 'SET_CURRENT_WORKSPACE', payload: currentWorkspaceId });
    if (workspaceList !== undefined) dispatch({ type: 'SET_WORKSPACE_LIST', payload: workspaceList });
  }, [dispatch, payload]);
  return null;
}

/**
 * Renders `children` inside a real AppStateProvider, optionally seeded with
 * `initialState` (any subset of WorkspaceData, plus currentWorkspaceId/workspaceList)
 * before the first assertion. Because seeding happens in an effect, tests must use
 * `find*` queries or `waitFor` for content that depends on the seeded state — a
 * synchronous `getBy*` right after render will see the provider's default `initialState`.
 */
export function renderWithAppState(
  ui: ReactNode,
  { initialState }: { initialState?: SeedState } = {},
): RenderResult {
  return render(
    <AppStateProvider>
      {initialState && <Seed payload={initialState} />}
      {ui}
    </AppStateProvider>,
  );
}
