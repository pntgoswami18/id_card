import { lazy, Suspense, useEffect, useRef } from 'react';
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
import theme from './theme';
import { AppStateProvider, useAppState, useAppDispatch } from './store/AppStateContext';
import {
  getWorkspaceList,
  getWorkspaceData,
  saveWorkspaceData,
} from './utils/workspaceStorage';
import type { WorkspaceData, WorkspaceMeta } from './utils/workspaceStorage';
import WorkspaceSwitcher from './components/WorkspaceSwitcher';

const DesignStep = lazy(() => import('./components/DesignStep'));
const DataStep = lazy(() => import('./components/DataStep'));
const PreviewStep = lazy(() => import('./components/PreviewStep'));
const PrintStep = lazy(() => import('./components/PrintStep'));

const steps = ['Design', 'Data', 'Preview', 'Print'];

function AppContent() {
  const { activeStep, currentWorkspaceId, workspaceList, currentWorkspaceLogo, template, records, columnMapping, printPresets, printSettings, selectedCardIndices, currentTemplateSource } = useAppState();
  const dispatch = useAppDispatch();
  const hydratedRef = useRef(false);

  const skipAutoSaveRef = useRef(true);

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

  useEffect(() => {
    if (!currentWorkspaceId) return;
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false;
      return;
    }
    const t = setTimeout(() => {
      saveWorkspaceData(currentWorkspaceId, {
        template,
        records,
        columnMapping,
        printPresets,
        printSettings,
        selectedCardIndices,
        currentTemplateSource,
        logo: currentWorkspaceLogo,
      });
    }, 400);
    return () => clearTimeout(t);
  }, [
    currentWorkspaceId,
    template,
    records,
    columnMapping,
    printPresets,
    printSettings,
    selectedCardIndices,
    currentTemplateSource,
    currentWorkspaceLogo,
  ]);

  const currentWorkspaceData: WorkspaceData = {
    template,
    records,
    columnMapping,
    printPresets,
    printSettings,
    selectedCardIndices,
    currentTemplateSource,
    logo: currentWorkspaceLogo,
  };

  const stepContent = [
    <DesignStep key="design" />,
    <DataStep key="data" />,
    <PreviewStep key="preview" />,
    <PrintStep key="print" />,
  ];

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
          maxWidth: 960,
          width: '100%',
          mx: 'auto',
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
            onSaveCurrent={(overrides?: Partial<WorkspaceData>) => {
              if (currentWorkspaceId) {
                const data = overrides ? { ...currentWorkspaceData, ...overrides } : currentWorkspaceData;
                saveWorkspaceData(currentWorkspaceId, data);
              }
            }}
            onLoadWorkspace={(data: WorkspaceData) => dispatch({ type: 'LOAD_WORKSPACE_STATE', payload: data })}
            onSetCurrentWorkspace={(id: string) => dispatch({ type: 'SET_CURRENT_WORKSPACE', payload: id })}
            onSetWorkspaceList={(list: WorkspaceMeta[]) => dispatch({ type: 'SET_WORKSPACE_LIST', payload: list })}
            onSetWorkspaceLogo={(logo: string | undefined) => dispatch({ type: 'SET_WORKSPACE_LOGO', payload: logo })}
          />
        </Box>
        <Stepper activeStep={activeStep} sx={{ pt: 2, pb: 4, flexShrink: 0 }} aria-label="Workflow steps">
          {steps.map((label, index) => (
            <Step key={label} completed={index < activeStep}>
              <StepButton
                onClick={() => dispatch({ type: 'SET_ACTIVE_STEP', payload: index })}
                aria-label={`Go to ${label} step`}
              >
                <StepLabel>{label}</StepLabel>
              </StepButton>
            </Step>
          ))}
        </Stepper>
        {activeStep > 0 && (
          <Box sx={{ mb: 2, flexShrink: 0 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => dispatch({ type: 'SET_ACTIVE_STEP', payload: activeStep - 1 })}
              aria-label="Go to previous step"
            >
              Back
            </Button>
          </Box>
        )}
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
            {stepContent[activeStep]}
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
