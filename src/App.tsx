import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, Component, type ReactNode } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Stepper from '@mui/material/Stepper';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import StepButton from '@mui/material/StepButton';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import Snackbar from '@mui/material/Snackbar';
import Alert from '@mui/material/Alert';

class StepErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <Box sx={{ p: 3 }}>
          <Typography color="error" variant="h6">Something went wrong in this step.</Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>{(this.state.error as Error).message}</Typography>
          <Button sx={{ mt: 2 }} onClick={() => this.setState({ error: null })}>Try Again</Button>
        </Box>
      );
    }
    return this.props.children;
  }
}
import theme from './theme';
import { AppStateProvider, useAppState, useAppDispatch } from './store/AppStateContext';
import {
  getWorkspaceList,
  getWorkspaceData,
  getEffectiveWorkspaceData,
  saveWorkspaceData,
  getDefaultWorkspaceData,
} from './utils/workspaceStorage';
import type { WorkspaceData, WorkspaceMeta } from './utils/workspaceStorage';
import { resolveWorkspaceAssets } from './utils/assetStore';
import { runMigrationIfNeeded, getMigrationNoticeIfAny, readLegacyWorkspaceList, readLegacyWorkspaceData } from './utils/storageMigration';
import {
  writeWorkspaceToHandle,
  getAutoSavePref,
  setAutoSavePref,
  type WorkspaceFileHandle,
} from './utils/workspaceFile';
import { getAllStoredHandles } from './utils/fileHandleStore';
import WorkspaceSwitcher from './components/WorkspaceSwitcher';

const DesignStep = lazy(() => import('./components/DesignStep'));
const DataStep = lazy(() => import('./components/DataStep'));
const PreviewStep = lazy(() => import('./components/PreviewStep'));
const PrintStep = lazy(() => import('./components/PrintStep'));

const steps = ['Design', 'Data', 'Preview', 'Print'];

function AppContent() {
  const { activeStep, currentWorkspaceId, workspaceList, currentWorkspaceLogo, template, records, columnMapping, printPresets, printSettings, selectedCardIndices, currentTemplateSource, csvData, templateLinkedToParent } = useAppState();
  const dispatch = useAppDispatch();
  const hydratedRef = useRef(false);
  const skipAutoSaveRef = useRef(true);
  const fileHandleRef = useRef<Map<string, WorkspaceFileHandle>>(new Map());
  const currentWorkspaceIdRef = useRef(currentWorkspaceId);
  const currentWorkspaceDataRef = useRef<WorkspaceData | null>(null);
  const [autoSaveToFile, setAutoSaveToFile] = useState(() => getAutoSavePref());
  // Resolved once the boot effect below has loaded the workspace list from IndexedDB;
  // starts false so the app doesn't flash the setup modal before that check completes.
  const [needsSetup, setNeedsSetup] = useState(false);
  // Gates the whole UI until the boot effect below has resolved, so neither the
  // main app nor the setup modal flashes before the workspace list is known.
  const [bootResolved, setBootResolved] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  // Bumped once IndexedDB-persisted file handles have been rehydrated into fileHandleRef,
  // so WorkspaceSwitcher's handle-sync effect (which reads a ref, not state) knows to re-check.
  const [handleRehydrationVersion, setHandleRehydrationVersion] = useState(0);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;

    // Best-effort: repopulate the in-memory handle map from IndexedDB so links established
    // in a previous session (before this page load) can silently resume autosave.
    void (async () => {
      const stored = await getAllStoredHandles();
      for (const [rootId, handle] of stored.entries()) {
        fileHandleRef.current.set(rootId, handle);
      }
      setHandleRehydrationVersion((v) => v + 1);
    })();

    void (async () => {
      try {
        // The localStorage -> IndexedDB storage migration must complete before the
        // workspace list/data reads below, which now read from IndexedDB exclusively —
        // otherwise an existing user's not-yet-migrated data would look absent and
        // trigger the first-launch setup modal. See src/utils/storageMigration.ts.
        const migration = await runMigrationIfNeeded();
        if (migration.degraded) {
          setStorageError("This browser's storage upgrade could not run — your data is still safe, but you may hit the same size limits as before.");
          // Read-only fallback: the legacy localStorage keys are still present, so an
          // existing user keeps access to their workspaces even though writes (idb) fail.
          const legacyList = readLegacyWorkspaceList();
          if (!legacyList || legacyList.workspaces.length === 0) {
            setNeedsSetup(true);
          } else {
            dispatch({ type: 'SET_WORKSPACE_LIST', payload: legacyList.workspaces });
            dispatch({ type: 'SET_CURRENT_WORKSPACE', payload: legacyList.currentId });
            const legacyData = readLegacyWorkspaceData(legacyList.currentId);
            if (legacyData) {
              skipAutoSaveRef.current = true;
              dispatch({ type: 'LOAD_WORKSPACE_STATE', payload: { ...legacyData, logo: legacyData.logo } });
            }
          }
          return;
        }
        const notice = await getMigrationNoticeIfAny();
        if (notice.checked && notice.count > 0) {
          setStorageError(`${notice.count} item(s) from your previous browser storage could not be upgraded and were left in place.`);
        }

        const list = await getWorkspaceList();
        if (list.workspaces.length === 0) {
          setNeedsSetup(true);
        }
        dispatch({ type: 'SET_WORKSPACE_LIST', payload: list.workspaces });
        dispatch({ type: 'SET_CURRENT_WORKSPACE', payload: list.currentId });
        const data = await getEffectiveWorkspaceData(list.currentId);
        if (data) {
          const resolved = await resolveWorkspaceAssets(data);
          // Re-arm the skip flag: the SET_WORKSPACE_LIST/SET_CURRENT_WORKSPACE render
          // above already consumed the initial one, and this LOAD dispatch lands in a
          // later render that must not trigger an autosave of freshly-loaded data.
          skipAutoSaveRef.current = true;
          dispatch({ type: 'LOAD_WORKSPACE_STATE', payload: { ...resolved, logo: resolved.logo } });
        }
      } finally {
        // Always lift the boot gate, even if a read unexpectedly threw, so the UI
        // never gets stuck on the spinner.
        setBootResolved(true);
      }
    })();
  }, [dispatch]);

  const currentWorkspaceName = workspaceList.find((w) => w.id === currentWorkspaceId)?.name ?? 'Workspace';

  useEffect(() => {
    if (!currentWorkspaceId) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    const data: WorkspaceData = {
      template,
      records,
      columnMapping,
      printPresets,
      printSettings,
      selectedCardIndices,
      currentTemplateSource,
      logo: currentWorkspaceLogo,
      csvData,
      templateLinkedToParent,
    };
    const t = setTimeout(() => {
      void (async () => {
        if (!(await saveWorkspaceData(currentWorkspaceId, data))) {
          setStorageError('Browser storage is full — this workspace could not be saved. Free up space by deleting unused workspaces or removing large images.');
        }
        if (autoSaveToFile) {
          // Always autosave from the root so children are included in the file.
          const rootId = workspaceList.find((w) => w.id === currentWorkspaceId)?.parentId ?? currentWorkspaceId;
          const handle = fileHandleRef.current.get(rootId);
          if (handle) {
            const rootMeta = workspaceList.find((w) => w.id === rootId);
            const rootName = rootMeta?.name ?? currentWorkspaceName;
            const childMetas = workspaceList.filter((w) => w.parentId === rootId);
            // Stored siblings hold asset: refs — resolve them so the .idcard file stays self-contained.
            const rootData = await resolveWorkspaceAssets(
              rootId === currentWorkspaceId ? data : ((await getWorkspaceData(rootId)) ?? data),
            );
            const children = await Promise.all(childMetas.map(async (meta) => ({
              meta: { name: meta.name, ...(meta.logo ? { logo: meta.logo } : {}) },
              data: await resolveWorkspaceAssets(
                (meta.id === currentWorkspaceId ? data : await getWorkspaceData(meta.id)) ?? getDefaultWorkspaceData(),
              ),
            })));
            void writeWorkspaceToHandle(handle, rootName, rootData, children);
          }
        }
      })();
    }, 400);
    return () => clearTimeout(t);
  }, [
    currentWorkspaceId,
    currentWorkspaceName,
    workspaceList,
    template,
    records,
    columnMapping,
    printPresets,
    printSettings,
    selectedCardIndices,
    currentTemplateSource,
    currentWorkspaceLogo,
    csvData,
    templateLinkedToParent,
    autoSaveToFile,
  ]);

  const currentWorkspaceData = useMemo<WorkspaceData>(() => ({
    template,
    records,
    columnMapping,
    printPresets,
    printSettings,
    selectedCardIndices,
    currentTemplateSource,
    logo: currentWorkspaceLogo,
    csvData,
    templateLinkedToParent,
  }), [template, records, columnMapping, printPresets, printSettings, selectedCardIndices, currentTemplateSource, currentWorkspaceLogo, csvData, templateLinkedToParent]);

  currentWorkspaceIdRef.current = currentWorkspaceId;
  currentWorkspaceDataRef.current = currentWorkspaceData;

  const stepContent = useMemo(() => [
    <DesignStep key="design" />,
    <DataStep key="data" />,
    <PreviewStep key="preview" />,
    <PrintStep key="print" />,
  ], []);

  const handleSaveCurrent = useCallback(async (overrides?: Partial<WorkspaceData>) => {
    const id = currentWorkspaceIdRef.current;
    if (!id) return;
    const base = currentWorkspaceDataRef.current!;
    const toSave = overrides ? { ...base, ...overrides } : base;
    if (!(await saveWorkspaceData(id, toSave))) {
      setStorageError('Browser storage is full — this workspace could not be saved. Free up space by deleting unused workspaces or removing large images.');
    }
  }, []);

  const handleLoadWorkspace = useCallback((data: WorkspaceData) => {
    skipAutoSaveRef.current = true;
    dispatch({ type: 'LOAD_WORKSPACE_STATE', payload: data });
  }, [dispatch]);

  const handleSetCurrentWorkspace = useCallback((id: string) => {
    dispatch({ type: 'SET_CURRENT_WORKSPACE', payload: id });
  }, [dispatch]);

  const handleSetWorkspaceList = useCallback((list: WorkspaceMeta[]) => {
    dispatch({ type: 'SET_WORKSPACE_LIST', payload: list });
  }, [dispatch]);

  const handleSetWorkspaceLogo = useCallback((logo: string | undefined) => {
    dispatch({ type: 'SET_WORKSPACE_LOGO', payload: logo });
  }, [dispatch]);

  if (!bootResolved) {
    return (
      <Box sx={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'background.default',
        overflow: 'hidden',
      }}
    >
      <Paper
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          width: '100%',
          p: { xs: 2, sm: 3 },
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, mb: 2, flexShrink: 0 }}>
          <Typography variant="h4" component="h1">
            ID Card Generator
          </Typography>
          <WorkspaceSwitcher
            workspaceList={workspaceList}
            currentWorkspaceId={currentWorkspaceId}
            currentWorkspaceLogo={currentWorkspaceLogo}
            autoSaveToFile={autoSaveToFile}
            onAutoSaveToFileChange={(v) => { setAutoSaveToFile(v); setAutoSavePref(v); }}
            fileHandleRef={fileHandleRef}
            handleRehydrationTick={handleRehydrationVersion}
            onSaveCurrent={handleSaveCurrent}
            onLoadWorkspace={handleLoadWorkspace}
            onSetCurrentWorkspace={handleSetCurrentWorkspace}
            onSetWorkspaceList={handleSetWorkspaceList}
            onSetWorkspaceLogo={handleSetWorkspaceLogo}
            needsSetup={needsSetup}
            onSetupDone={() => setNeedsSetup(false)}
          />
        </Box>
        <Stepper
          activeStep={activeStep}
          sx={{
            pt: 2, pb: 3, flexShrink: 0,
            flexWrap: { xs: 'wrap', sm: 'nowrap' },
            rowGap: 1,
            columnGap: { xs: 0.5, sm: 0 },
            // Remove the default connector line between steps
            '& .MuiStepConnector-line': { borderColor: 'transparent' },
            // Connectors add flex-basis the compact mobile layout can't spare; collapse them below sm and
            // replace with a small flex gap so steps don't sit flush against each other.
            '& .MuiStepConnector-root': { display: { xs: 'none', sm: 'block' } },
          }}
          aria-label="Workflow steps"
        >
          {steps.map((label, index) => {
            const needsRecords = index >= 2;
            const isDisabled = needsRecords && records.length === 0;
            const isActive = index === activeStep;
            const isCompleted = index < activeStep;
            return (
              <Step key={label} completed={isCompleted}>
                <StepButton
                  onClick={() => dispatch({ type: 'SET_ACTIVE_STEP', payload: index })}
                  disabled={isDisabled}
                  aria-label={`Go to ${label} step`}
                  sx={{
                    borderRadius: 2,
                    px: { xs: 1, sm: 2 },
                    py: 1,
                    transition: 'background 0.15s, box-shadow 0.15s',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    ...(isActive && {
                      bgcolor: 'primary.main',
                      boxShadow: 2,
                      '& .MuiStepLabel-label': { color: 'primary.contrastText' },
                      '& .MuiStepIcon-root': { color: 'primary.contrastText' },
                      '& .MuiStepIcon-text': { fill: 'primary.main' },
                    }),
                    ...(!isActive && !isDisabled && {
                      '&:hover': {
                        bgcolor: 'action.hover',
                        boxShadow: 1,
                      },
                    }),
                  }}
                >
                  <StepLabel
                    sx={{
                      '& .MuiStepLabel-label': {
                        fontSize: { xs: '0.8125rem', sm: '0.875rem' },
                        fontWeight: 500,
                        color: isDisabled
                          ? 'text.disabled'
                          : isActive
                          ? 'primary.contrastText'
                          : 'text.primary',
                      },
                    }}
                  >
                    {label}
                  </StepLabel>
                </StepButton>
              </Step>
            );
          })}
        </Stepper>
        <Box
          sx={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Suspense fallback={<Box sx={{ display: 'flex', justifyContent: 'center', py: 8, flex: 1 }}><CircularProgress /></Box>}>
            <StepErrorBoundary key={activeStep}>
              {stepContent[activeStep]}
            </StepErrorBoundary>
          </Suspense>
        </Box>
      </Paper>
      <Snackbar
        open={storageError !== null}
        onClose={() => setStorageError(null)}
        autoHideDuration={8000}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" variant="filled" onClose={() => setStorageError(null)}>
          {storageError}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppStateProvider>
        <AppContent />
      </AppStateProvider>
    </ThemeProvider>
  );
}

export default App;
