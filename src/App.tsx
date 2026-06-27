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
  LIST_KEY,
  getWorkspaceList,
  getWorkspaceData,
  saveWorkspaceData,
  getDefaultWorkspaceData,
} from './utils/workspaceStorage';
import type { WorkspaceData, WorkspaceMeta } from './utils/workspaceStorage';
import {
  writeWorkspaceToHandle,
  getAutoSavePref,
  setAutoSavePref,
  type WorkspaceFileHandle,
} from './utils/workspaceFile';
import WorkspaceSwitcher from './components/WorkspaceSwitcher';

const DesignStep = lazy(() => import('./components/DesignStep'));
const DataStep = lazy(() => import('./components/DataStep'));
const PreviewStep = lazy(() => import('./components/PreviewStep'));
const PrintStep = lazy(() => import('./components/PrintStep'));

const steps = ['Design', 'Data', 'Preview', 'Print'];

function AppContent() {
  const { activeStep, currentWorkspaceId, workspaceList, currentWorkspaceLogo, template, records, columnMapping, printPresets, printSettings, selectedCardIndices, currentTemplateSource, csvData } = useAppState();
  const dispatch = useAppDispatch();
  const hydratedRef = useRef(false);
  const skipAutoSaveRef = useRef(true);
  const fileHandleRef = useRef<WorkspaceFileHandle | null>(null);
  const [autoSaveToFile, setAutoSaveToFile] = useState(() => getAutoSavePref());
  const [needsSetup, setNeedsSetup] = useState(() => localStorage.getItem(LIST_KEY) === null);

  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    const list = getWorkspaceList();
    dispatch({ type: 'SET_WORKSPACE_LIST', payload: list.workspaces });
    dispatch({ type: 'SET_CURRENT_WORKSPACE', payload: list.currentId });
    const data = getWorkspaceData(list.currentId);
    if (data) {
      dispatch({ type: 'LOAD_WORKSPACE_STATE', payload: { ...data, logo: data.logo } });
    }
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
    };
    const t = setTimeout(() => {
      saveWorkspaceData(currentWorkspaceId, { ...data, csvData: null });
      if (autoSaveToFile && fileHandleRef.current) {
        // Always autosave from the root so children are included in the file.
        const rootId = workspaceList.find((w) => w.id === currentWorkspaceId)?.parentId ?? currentWorkspaceId;
        const rootMeta = workspaceList.find((w) => w.id === rootId);
        const rootData = rootId === currentWorkspaceId ? data : (getWorkspaceData(rootId) ?? data);
        const rootName = rootMeta?.name ?? currentWorkspaceName;
        const childMetas = workspaceList.filter((w) => w.parentId === rootId);
        const children = childMetas.map((meta) => ({
          meta: { name: meta.name, ...(meta.logo ? { logo: meta.logo } : {}) },
          data: (meta.id === currentWorkspaceId ? data : getWorkspaceData(meta.id)) ?? getDefaultWorkspaceData(),
        }));
        void writeWorkspaceToHandle(fileHandleRef.current, rootName, rootData, children);
      }
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
  }), [template, records, columnMapping, printPresets, printSettings, selectedCardIndices, currentTemplateSource, currentWorkspaceLogo, csvData]);

  const stepContent = useMemo(() => [
    <DesignStep key="design" />,
    <DataStep key="data" />,
    <PreviewStep key="preview" />,
    <PrintStep key="print" />,
  ], []);

  const handleSaveCurrent = useCallback((overrides?: Partial<WorkspaceData>) => {
    if (currentWorkspaceId) {
      const toSave = overrides ? { ...currentWorkspaceData, ...overrides } : currentWorkspaceData;
      saveWorkspaceData(currentWorkspaceId, { ...toSave, csvData: null });
    }
  }, [currentWorkspaceId, currentWorkspaceData]);

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
            currentWorkspaceData={currentWorkspaceData}
            currentWorkspaceLogo={currentWorkspaceLogo}
            autoSaveToFile={autoSaveToFile}
            onAutoSaveToFileChange={(v) => { setAutoSaveToFile(v); setAutoSavePref(v); }}
            fileHandleRef={fileHandleRef}
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
            // Remove the default connector line between steps
            '& .MuiStepConnector-line': { borderColor: 'transparent' },
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
                    px: 2,
                    py: 1,
                    transition: 'background 0.15s, box-shadow 0.15s',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    ...(isActive && {
                      bgcolor: 'primary.main',
                      boxShadow: 2,
                      '& .MuiStepLabel-label': { color: 'primary.contrastText', fontWeight: 700 },
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
                        fontWeight: isActive ? 700 : 500,
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
