import type {
  ExtractionResult,
  ExtractionConfig,
} from '../../extraction-schema.js';
import type { Pipeline, PipelineStep } from '../../pipeline/pipeline-builder.js';
import type { PipelineExecutionResult, StepResult } from '../../pipeline/pipeline-runner.js';
import type { ScheduledTask } from '../../monitoring/scheduler.js';

// =============================================================================
// Types for the Dashboard
// =============================================================================

export interface ExtractionAlert {
  id: string;
  type: 'error' | 'warning' | 'success' | 'info';
  message: string;
  timestamp: string;
  source: 'extraction' | 'pipeline' | 'schedule';
  relatedId?: string;
}

export interface ExtractionHistoryEntry {
  id: string;
  result: ExtractionResult;
  config: Partial<ExtractionConfig>;
  pipelineExecution?: PipelineExecutionResult;
}

export interface ScheduleStatus {
  task: ScheduledTask;
  status: 'running' | 'paused' | 'scheduled' | 'error';
  recentRuns: Array<{
    timestamp: Date;
    success: boolean;
    error?: string;
  }>;
}

// =============================================================================
// Utility Functions
// =============================================================================

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString();
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getConfidenceColor(score: number): string {
  if (score >= 0.8) return 'text-green-600';
  if (score >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
}

function getStatusColor(status: PipelineExecutionResult['status']): string {
  switch (status) {
    case 'completed': return 'bg-green-100 text-green-800';
    case 'partial': return 'bg-yellow-100 text-yellow-800';
    case 'failed': return 'bg-red-100 text-red-800';
  }
}

function getAlertColor(type: ExtractionAlert['type']): string {
  switch (type) {
    case 'error': return 'bg-red-50 border-red-200 text-red-800';
    case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
    case 'success': return 'bg-green-50 border-green-200 text-green-800';
    case 'info': return 'bg-blue-50 border-blue-200 text-blue-800';
  }
}

// =============================================================================
// Sub-Components (render functions returning React.RA elements)
// =============================================================================

function ConfidenceBadge(props: { score: number; showLabel?: boolean }): React.ReactElement {
  const percentage = Math.round(props.score * 100);
  return (
    React.createElement('span', { className: `font-medium ${getConfidenceColor(props.score)}` },
      `${percentage}%${props.showLabel !== false ? ' confidence' : ''}`
    )
  );
}

function StatusBadge(props: { status: PipelineExecutionResult['status'] }): React.ReactElement {
  return (
    React.createElement('span', { className: `px-2 py-1 rounded text-xs font-medium ${getStatusColor(props.status)}` },
      props.status.charAt(0).toUpperCase() + props.status.slice(1)
    )
  );
}

function MethodBadge(props: { method: ExtractionResult['method'] }): React.ReactElement {
  const colors: Record<string, string> = {
    llm: 'bg-purple-100 text-purple-800',
    vision: 'bg-blue-100 text-blue-800',
    table: 'bg-orange-100 text-orange-800',
    regex: 'bg-gray-100 text-gray-800',
  };
  return (
    React.createElement('span', { className: `px-2 py-1 rounded text-xs font-medium ${colors[props.method] || colors.regex}` },
      props.method.toUpperCase()
    )
  );
}

function StepResultItem(props: { step: StepResult; stepDefinition?: PipelineStep }): React.ReactElement {
  const { step, stepDefinition } = props;
  const childElements: React.ReactNode[] = [];

  // Header
  childElements.push(
    React.createElement('div', { key: 'header', className: 'flex items-center justify-between mb-2' },
      React.createElement('div', { key: 'left', className: 'flex items-center gap-2' },
        React.createElement('span', { key: 'id', className: 'font-medium text-sm' }, step.stepId),
        React.createElement('span', { key: 'type', className: 'text-xs text-gray-500' }, `(${step.stepType})`)
      ),
      React.createElement('div', { key: 'right', className: 'flex items-center gap-3 text-xs' },
        React.createElement('span', {
          key: 'conf',
          className: step.skipped ? 'text-gray-400' : getConfidenceColor(step.confidence)
        }, step.skipped ? 'SKIPPED' : `${Math.round(step.confidence * 100)}%`),
        React.createElement('span', { key: 'dur', className: 'text-gray-500' }, formatDuration(step.durationMs))
      )
    )
  );

  // Skip reason
  if (step.skipped && step.skipReason) {
    childElements.push(
      React.createElement('div', { key: 'skip', className: 'text-xs text-gray-500 mb-2' },
        `Skip reason: ${step.skipReason}`
      )
    );
  }

  // Errors
  if (step.errors.length > 0) {
    childElements.push(
      React.createElement('div', { key: 'errors', className: 'text-xs text-red-600' },
        step.errors.map((err, i) => 
          React.createElement('div', { key: i }, `Error: ${err}`)
        )
      )
    );
  }

  // Method info
  if (stepDefinition?.config) {
    childElements.push(
      React.createElement('div', { key: 'method', className: 'text-xs text-gray-400 mt-1' },
        `Method: ${stepDefinition.config.extractionMethod || stepDefinition.config.transformType || 'N/A'}`
      )
    );
  }

  return React.createElement('div', { className: 'border rounded p-3 mb-2 bg-white' }, ...childElements);
}

function PipelineExecutionCard(props: { execution: PipelineExecutionResult; pipeline?: Pipeline }): React.ReactElement {
  const { execution, pipeline } = props;
  const [expanded, setExpanded] = useState(false);
  const stepMap = new Map(pipeline?.steps.map(s => [s.id, s]) || []);

  const avgConfidence = execution.stepResults.length > 0
    ? execution.stepResults.reduce((sum, s) => sum + s.confidence, 0) / execution.stepResults.length
    : 0;

  return (
    React.createElement('div', { className: 'border rounded-lg p-4 bg-white shadow-sm' },
      // Header
      React.createElement('div', { key: 'header', className: 'flex items-center justify-between mb-3' },
        React.createElement('div', { key: 'title' },
          React.createElement('h4', { key: 'name', className: 'font-medium' }, execution.pipelineName),
          React.createElement('span', { key: 'id', className: 'text-xs text-gray-500' }, execution.pipelineId)
        ),
        React.createElement('div', { key: 'meta', className: 'flex items-center gap-3' },
          React.createElement(StatusBadge, { key: 'status', status: execution.status }),
          React.createElement('span', { key: 'time', className: 'text-sm text-gray-600' }, formatDuration(execution.executionTime))
        )
      ),
      // Stats
      React.createElement('div', { key: 'stats', className: 'flex items-center gap-4 text-sm mb-3' },
        React.createElement('span', { key: 'steps' }, `${execution.stepResults.length} steps`),
        React.createElement(ConfidenceBadge, { key: 'conf', score: avgConfidence })
      ),
      // Errors
      execution.errors.length > 0 && execution.errors.length > 0 && (
        React.createElement('div', { key: 'errors', className: 'text-xs text-red-600 mb-3' },
          `${execution.errors.length} error(s): ${execution.errors[0]}`
        )
      ),
      // Toggle button
      React.createElement('button', {
        key: 'toggle',
        className: 'text-sm text-blue-600 hover:text-blue-800',
        onClick: () => setExpanded(!expanded)
      }, expanded ? 'Hide' : 'Show', ' step details'),
      // Expanded steps
      expanded && (
        React.createElement('div', { key: 'steps', className: 'mt-3' },
          ...execution.stepResults.map((step, i) =>
            React.createElement(StepResultItem, { key: i, step, stepDefinition: stepMap.get(step.stepId) })
          )
        )
      )
    )
  );
}

function ExtractionResultCard(props: { 
  entry: ExtractionHistoryEntry; 
  onViewDetails?: (entry: ExtractionHistoryEntry) => void;
}): React.ReactElement {
  const { entry, onViewDetails } = props;
  const { result } = entry;
  const childElements: React.ReactNode[] = [];

  // Header
  childElements.push(
    React.createElement('div', { key: 'header', className: 'flex items-center justify-between mb-3' },
      React.createElement('div', { key: 'badges', className: 'flex items-center gap-2' },
        React.createElement(MethodBadge, { key: 'method', method: result.method }),
        React.createElement(ConfidenceBadge, { key: 'conf', score: result.confidence })
      ),
      React.createElement('span', { 
        key: 'time', 
        className: 'text-xs text-gray-500',
        title: formatTimestamp(result.timestamp)
      }, formatRelativeTime(result.timestamp))
    )
  );

  // Schema validation
  if (result.schemaValidation) {
    childElements.push(
      React.createElement('div', { key: 'schema', className: 'mb-3' },
        result.schemaValidation.valid
          ? React.createElement('span', { key: 'valid', className: 'text-xs text-green-600' }, 'Schema valid')
          : React.createElement('span', { key: 'invalid', className: 'text-xs text-red-600' },
              `${result.schemaValidation.errors.length} schema error(s)`
            )
      )
    );
  }

  // Errors
  if (result.errors.length > 0) {
    childElements.push(
      React.createElement('div', { key: 'errors', className: 'text-xs text-red-600 mb-3' },
        result.errors.slice(0, 2).map((err, i) => 
          React.createElement('div', { key: i, className: 'truncate' }, err)
        ),
        result.errors.length > 2 && React.createElement('span', { key: 'more' }, `...and ${result.errors.length - 2} more`)
      )
    );
  }

  // Low confidence warning
  if (result.confidence < 0.7 && result.confidence > 0) {
    childElements.push(
      React.createElement('div', { key: 'lowconf', className: 'text-xs text-yellow-600 mb-3' },
        'Low confidence extraction'
      )
    );
  }

  // Pipeline execution
  if (entry.pipelineExecution) {
    childElements.push(
      React.createElement('div', { key: 'pipeline', className: 'mb-3' },
        React.createElement(PipelineExecutionCard, { 
          key: 'exec', 
          execution: entry.pipelineExecution 
        })
      )
    );
  }

  // View details button
  if (onViewDetails) {
    childElements.push(
      React.createElement('button', {
        key: 'btn',
        className: 'text-sm text-blue-600 hover:text-blue-800',
        onClick: () => onViewDetails(entry)
      }, 'View details')
    );
  }

  return React.createElement('div', { className: 'border rounded-lg p-4 bg-white shadow-sm' }, ...childElements);
}

function ScheduleCard(props: {
  schedule: ScheduleStatus;
  onPause?: (id: string) => void;
  onResume?: (id: string) => void;
  onRemove?: (id: string) => void;
}): React.ReactElement {
  const { schedule, onPause, onResume, onRemove } = props;
  const { task, status, recentRuns } = schedule;
  const childElements: React.ReactNode[] = [];

  const statusColors: Record<string, string> = {
    running: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    scheduled: 'bg-blue-100 text-blue-800',
    error: 'bg-red-100 text-red-800',
  };

  // Header
  childElements.push(
    React.createElement('div', { key: 'header', className: 'flex items-center justify-between mb-3' },
      React.createElement('div', { key: 'title' },
        React.createElement('h4', { key: 'name', className: 'font-medium' }, task.id),
        React.createElement('span', { key: 'url', className: 'text-xs text-gray-500 truncate block max-w-xs' }, task.url)
      ),
      React.createElement('span', { className: `px-2 py-1 rounded text-xs font-medium ${statusColors[status]}` },
        status
      )
    )
  );

  // Grid stats
  childElements.push(
    React.createElement('div', { key: 'stats', className: 'grid grid-cols-2 gap-4 text-sm mb-3' },
      React.createElement('div', { key: 'interval' },
        React.createElement('span', { key: 'label', className: 'text-gray-500' }, 'Interval:'),
        React.createElement('span', { key: 'value', className: 'ml-2' }, formatDuration(task.intervalMs))
      ),
      React.createElement('div', { key: 'nextrun' },
        React.createElement('span', { key: 'label', className: 'text-gray-500' }, 'Next run:'),
        React.createElement('span', { key: 'value', className: 'ml-2' },
          task.nextRunTime ? formatRelativeTime(task.nextRunTime.toISOString()) : 'N/A'
        )
      )
    )
  );

  // Recent runs
  if (recentRuns.length > 0) {
    childElements.push(
      React.createElement('div', { key: 'runs', className: 'mb-3' },
        React.createElement('span', { key: 'label', className: 'text-xs text-gray-500' }, 'Recent runs:'),
        React.createElement('div', { key: 'dots', className: 'flex gap-2 mt-1' },
          ...recentRuns.slice(-5).map((run, i) =>
            React.createElement('span', {
              key: i,
              className: `w-2 h-2 rounded-full ${run.success ? 'bg-green-500' : 'bg-red-500'}`,
              title: `${run.success ? 'Success' : run.error || 'Failed'} at ${run.timestamp.toLocaleTimeString()}`
            })
          )
        )
      )
    );
  }

  // Action buttons
  const buttons: React.ReactNode[] = [];
  if (status === 'running' && onPause) {
    buttons.push(
      React.createElement('button', {
        key: 'pause',
        className: 'text-xs text-yellow-600 hover:text-yellow-800',
        onClick: () => onPause(task.id)
      }, 'Pause')
    );
  }
  if (status === 'paused' && onResume) {
    buttons.push(
      React.createElement('button', {
        key: 'resume',
        className: 'text-xs text-green-600 hover:text-green-800',
        onClick: () => onResume(task.id)
      }, 'Resume')
    );
  }
  if (onRemove) {
    buttons.push(
      React.createElement('button', {
        key: 'remove',
        className: 'text-xs text-red-600 hover:text-red-800',
        onClick: () => onRemove(task.id)
      }, 'Remove')
    );
  }
  if (buttons.length > 0) {
    childElements.push(React.createElement('div', { key: 'actions', className: 'flex gap-2' }, ...buttons));
  }

  return React.createElement('div', { className: 'border rounded-lg p-4 bg-white shadow-sm' }, ...childElements);
}

function AlertItem(props: { alert: ExtractionAlert; onDismiss?: (id: string) => void }): React.ReactElement {
  const { alert, onDismiss } = props;
  
  return (
    React.createElement('div', { className: `border rounded p-3 ${getAlertColor(alert.type)}` },
      React.createElement('div', { key: 'content', className: 'flex items-start justify-between' },
        React.createElement('div', { key: 'message', className: 'flex items-start gap-2' },
          React.createElement('span', { key: 'text', className: 'text-sm' }, alert.message)
        ),
        React.createElement('div', { key: 'meta', className: 'flex items-center gap-2' },
          React.createElement('span', { key: 'time', className: 'text-xs opacity-60' }, formatRelativeTime(alert.timestamp)),
          onDismiss && React.createElement('button', {
            key: 'dismiss',
            className: 'text-xs opacity-60 hover:opacity-100',
            onClick: () => onDismiss(alert.id)
          }, 'Dismiss')
        )
      )
    )
  );
}

// =============================================================================
// Main Dashboard Component
// =============================================================================

export interface ExtractionMonitorProps {
  /** Current active extraction results */
  activeExtractions?: ExtractionResult[];
  /** Historical extraction results */
  history?: ExtractionHistoryEntry[];
  /** Currently executing pipelines */
  activePipelines?: PipelineExecutionResult[];
  /** Available pipelines for reference */
  pipelines?: Pipeline[];
  /** Scheduled extraction tasks */
  schedules?: ScheduleStatus[];
  /** Current alerts */
  alerts?: ExtractionAlert[];
  /** Loading state */
  loading?: boolean;
  /** Refresh callback */
  onRefresh?: () => void;
  /** Pause scheduled task */
  onPauseSchedule?: (id: string) => void;
  /** Resume scheduled task */
  onResumeSchedule?: (id: string) => void;
  /** Remove scheduled task */
  onRemoveSchedule?: (id: string) => void;
  /** View extraction details */
  onViewExtraction?: (entry: ExtractionHistoryEntry) => void;
  /** Clear alert */
  onDismissAlert?: (id: string) => void;
  /** Filter by method */
  methodFilter?: ExtractionResult['method'][];
  /** Time range filter */
  timeRange?: '1h' | '6h' | '24h' | '7d' | 'all';
}

export function ExtractionMonitor(props: ExtractionMonitorProps): React.ReactElement {
  const {
    activeExtractions = [],
    history = [],
    activePipelines = [],
    pipelines = [],
    schedules = [],
    alerts = [],
    loading = false,
    onRefresh,
    onPauseSchedule,
    onResumeSchedule,
    onRemoveSchedule,
    onViewExtraction,
    onDismissAlert,
    methodFilter,
    timeRange = '24h',
  } = props;

  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'schedules' | 'alerts'>('overview');
  const [localMethodFilter, setLocalMethodFilter] = useState<ExtractionResult['method'][]>(methodFilter || []);
  const [localTimeRange, setLocalTimeRange] = useState(timeRange);

  // Filter history based on method and time range
  const filteredHistory = history.filter(entry => {
    if (localMethodFilter.length > 0 && !localMethodFilter.includes(entry.result.method)) {
      return false;
    }
    if (localTimeRange !== 'all') {
      const now = new Date();
      const entryTime = new Date(entry.result.timestamp);
      const hours: Record<string, number> = { '1h': 1, '6h': 6, '24h': 24, '7d': 168 };
      if ((now.getTime() - entryTime.getTime()) > hours[localTimeRange] * 60 * 60 * 1000) {
        return false;
      }
    }
    return true;
  });

  // Calculate stats
  const stats = {
    totalExtractions: history.length,
    avgConfidence: history.length > 0
      ? history.reduce((sum, e) => sum + e.result.confidence, 0) / history.length
      : 0,
    successRate: history.length > 0
      ? (history.filter(e => e.result.errors.length === 0).length / history.length) * 100
      : 0,
    activePipelines: activePipelines.length,
    scheduledTasks: schedules.length,
    alertsCount: alerts.length,
  };

  const pipelineMap = new Map(pipelines.map(p => [p.id, p]));

  // Build the component tree
  const childElements: React.ReactNode[] = [];

  // ========== Header ==========
  childElements.push(
    React.createElement('div', { key: 'header', className: 'flex items-center justify-between mb-6' },
      React.createElement('div', { key: 'title' },
        React.createElement('h2', { key: 'h2', className: 'text-xl font-semibold' }, 'Extraction Monitor'),
        React.createElement('p', { key: 'desc', className: 'text-sm text-gray-500' }, 
          'Monitor extraction jobs, pipelines, and schedules')
      ),
      React.createElement('div', { key: 'actions', className: 'flex items-center gap-3' },
        onRefresh && React.createElement('button', {
          key: 'refresh',
          className: 'px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50',
          disabled: loading,
          onClick: onRefresh
        }, loading ? 'Refreshing...' : 'Refresh')
      )
    )
  );

  // ========== Stats Cards ==========
  childElements.push(
    React.createElement('div', { key: 'stats', className: 'grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6' },
      React.createElement('div', { key: 'total', className: 'border rounded p-3 bg-white' },
        React.createElement('div', { key: 'val', className: 'text-2xl font-semibold' }, stats.totalExtractions),
        React.createElement('div', { key: 'lbl', className: 'text-xs text-gray-500' }, 'Total Extractions')
      ),
      React.createElement('div', { key: 'avgconf', className: 'border rounded p-3 bg-white' },
        React.createElement('div', { key: 'val', className: `text-2xl font-semibold ${getConfidenceColor(stats.avgConfidence)}` },
          `${Math.round(stats.avgConfidence * 100)}%`
        ),
        React.createElement('div', { key: 'lbl', className: 'text-xs text-gray-500' }, 'Avg Confidence')
      ),
      React.createElement('div', { key: 'success', className: 'border rounded p-3 bg-white' },
        React.createElement('div', {
          key: 'val',
          className: `text-2xl font-semibold ${stats.successRate >= 80 ? 'text-green-600' : 'text-yellow-600'}`
        }, `${Math.round(stats.successRate)}%`),
        React.createElement('div', { key: 'lbl', className: 'text-xs text-gray-500' }, 'Success Rate')
      ),
      React.createElement('div', { key: 'pipelines', className: 'border rounded p-3 bg-white' },
        React.createElement('div', { key: 'val', className: 'text-2xl font-semibold' }, stats.activePipelines),
        React.createElement('div', { key: 'lbl', className: 'text-xs text-gray-500' }, 'Active Pipelines')
      ),
      React.createElement('div', { key: 'scheduled', className: 'border rounded p-3 bg-white' },
        React.createElement('div', { key: 'val', className: 'text-2xl font-semibold' }, stats.scheduledTasks),
        React.createElement('div', { key: 'lbl', className: 'text-xs text-gray-500' }, 'Scheduled Tasks')
      ),
      React.createElement('div', { key: 'alerts', className: 'border rounded p-3 bg-white' },
        React.createElement('div', {
          key: 'val',
          className: `text-2xl font-semibold ${stats.alertsCount > 0 ? 'text-red-600' : 'text-gray-600'}`
        }, stats.alertsCount),
        React.createElement('div', { key: 'lbl', className: 'text-xs text-gray-500' }, 'Alerts')
      )
    )
  );

  // ========== Active Extractions ==========
  if (activeExtractions.length > 0) {
    childElements.push(
      React.createElement('div', { key: 'active', className: 'mb-6' },
        React.createElement('h3', { key: 'title', className: 'text-lg font-medium mb-3' }, 'Active Extractions'),
        React.createElement('div', { key: 'grid', className: 'grid gap-3 md:grid-cols-2 lg:grid-cols-3' },
          ...activeExtractions.map((result, i) =>
            React.createElement('div', { key: i, className: 'border rounded-lg p-4 bg-blue-50 border-blue-200' },
              React.createElement('div', { key: 'header', className: 'flex items-center justify-between mb-2' },
                React.createElement(MethodBadge, { key: 'method', method: result.method }),
                React.createElement('span', { key: 'status', className: 'text-xs text-blue-600' }, 'Running...')
              ),
              React.createElement(ConfidenceBadge, { key: 'conf', score: result.confidence })
            )
          )
        )
      )
    );
  }

  // ========== Tabs ==========
  const tabButtons: React.ReactNode[] = (['overview', 'history', 'schedules', 'alerts'] as const).map(tab => {
    const isActive = activeTab === tab;
    const badge = tab === 'alerts' && alerts.length > 0
      ? React.createElement('span', { key: 'badge', className: 'ml-1 bg-red-100 text-red-600 text-xs px-1.5 rounded' }, alerts.length)
      : null;
    
    return React.createElement('button', {
      key: tab,
      onClick: () => setActiveTab(tab),
      className: `pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
        isActive ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
      }`
    }, tab.charAt(0).toUpperCase() + tab.slice(1), badge);
  });

  childElements.push(
    React.createElement('div', { key: 'tabs', className: 'border-b mb-4' },
      React.createElement('nav', { key: 'nav', className: 'flex gap-4' }, ...tabButtons)
    )
  );

  // ========== Tab Content ==========
  if (activeTab === 'overview') {
    const overviewContent: React.ReactNode[] = [];

    // Recent Extractions
    overviewContent.push(
      React.createElement('div', { key: 'recent' },
        React.createElement('h3', { key: 'title', className: 'text-lg font-medium mb-3' }, 'Recent Extractions'),
        filteredHistory.length === 0
          ? React.createElement('div', { key: 'empty', className: 'border rounded p-8 text-center text-gray-500' }, 'No extractions found')
          : React.createElement('div', { key: 'list', className: 'space-y-3' },
              ...filteredHistory.slice(0, 5).map((entry, i) =>
                React.createElement(ExtractionResultCard, { key: i, entry, onViewDetails: onViewExtraction })
              )
            )
      )
    );

    // Active Pipelines
    overviewContent.push(
      React.createElement('div', { key: 'pipelines' },
        React.createElement('h3', { key: 'title', className: 'text-lg font-medium mb-3' }, 'Active Pipelines'),
        activePipelines.length === 0
          ? React.createElement('div', { key: 'empty', className: 'border rounded p-8 text-center text-gray-500' }, 'No active pipelines')
          : React.createElement('div', { key: 'list', className: 'space-y-3' },
              ...activePipelines.map((exec, i) =>
                React.createElement(PipelineExecutionCard, {
                  key: i,
                  execution: exec,
                  pipeline: pipelineMap.get(exec.pipelineId)
                })
              )
            )
      )
    );

    childElements.push(
      React.createElement('div', { key: 'overview', className: 'grid gap-6 md:grid-cols-2' }, ...overviewContent)
    );
  }

  if (activeTab === 'history') {
    const historyContent: React.ReactNode[] = [];

    // Filters
    historyContent.push(
      React.createElement('div', { key: 'filters', className: 'flex flex-wrap gap-4 mb-4' },
        React.createElement('div', { key: 'method' },
          React.createElement('label', { key: 'label', className: 'text-xs text-gray-500 block mb-1' }, 'Method'),
          React.createElement('select', {
            key: 'select',
            multiple: true,
            value: localMethodFilter,
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) => {
              const options = Array.from(e.target.selectedOptions, opt => opt.value as ExtractionResult['method']);
              setLocalMethodFilter(options);
            },
            className: 'border rounded px-2 py-1 text-sm'
          },
            React.createElement('option', { key: 'llm', value: 'llm' }, 'LLM'),
            React.createElement('option', { key: 'vision', value: 'vision' }, 'Vision'),
            React.createElement('option', { key: 'table', value: 'table' }, 'Table'),
            React.createElement('option', { key: 'regex', value: 'regex' }, 'Regex')
          )
        ),
        React.createElement('div', { key: 'time' },
          React.createElement('label', { key: 'label', className: 'text-xs text-gray-500 block mb-1' }, 'Time Range'),
          React.createElement('select', {
            key: 'select',
            value: localTimeRange,
            onChange: (e: React.ChangeEvent<HTMLSelectElement>) => setLocalTimeRange(e.target.value as typeof localTimeRange),
            className: 'border rounded px-2 py-1 text-sm'
          },
            React.createElement('option', { key: '1h', value: '1h' }, 'Last 1 hour'),
            React.createElement('option', { key: '6h', value: '6h' }, 'Last 6 hours'),
            React.createElement('option', { key: '24h', value: '24h' }, 'Last 24 hours'),
            React.createElement('option', { key: '7d', value: '7d' }, 'Last 7 days'),
            React.createElement('option', { key: 'all', value: 'all' }, 'All time')
          )
        ),
        React.createElement('div', { key: 'count', className: 'text-sm text-gray-500 self-end' },
          `${filteredHistory.length} result(s)`
        )
      )
    );

    // History list
    historyContent.push(
      filteredHistory.length === 0
        ? React.createElement('div', { key: 'empty', className: 'border rounded p-8 text-center text-gray-500' }, 'No extraction history found')
        : React.createElement('div', { key: 'grid', className: 'grid gap-3 md:grid-cols-2 lg:grid-cols-3' },
            ...filteredHistory.map((entry, i) =>
              React.createElement(ExtractionResultCard, { key: i, entry, onViewDetails: onViewExtraction })
            )
          )
    );

    childElements.push(React.createElement('div', { key: 'history' }, ...historyContent));
  }

  if (activeTab === 'schedules') {
    childElements.push(
      React.createElement('div', { key: 'schedules' },
        schedules.length === 0
          ? React.createElement('div', { key: 'empty', className: 'border rounded p-8 text-center text-gray-500' }, 'No scheduled tasks')
          : React.createElement('div', { key: 'grid', className: 'grid gap-3 md:grid-cols-2 lg:grid-cols-3' },
              ...schedules.map((schedule, i) =>
                React.createElement(ScheduleCard, {
                  key: i,
                  schedule,
                  onPause: onPauseSchedule,
                  onResume: onResumeSchedule,
                  onRemove: onRemoveSchedule
                })
              )
            )
      )
    );
  }

  if (activeTab === 'alerts') {
    childElements.push(
      React.createElement('div', { key: 'alerts' },
        alerts.length === 0
          ? React.createElement('div', { key: 'empty', className: 'border rounded p-8 text-center text-gray-500' }, 'No alerts')
          : React.createElement('div', { key: 'list', className: 'space-y-2' },
              ...alerts.map((alert, i) =>
                React.createElement(AlertItem, { key: i, alert, onDismiss: onDismissAlert })
              )
            )
      )
    );
  }

  return React.createElement('div', { className: 'extraction-monitor' }, ...childElements);
}

// =============================================================================
// Re-export types for consumers
// =============================================================================

export type {
  ExtractionAlert,
  ExtractionHistoryEntry,
  ScheduleStatus,
  ConfidenceBadgeProps,
  StatusBadgeProps,
  MethodBadgeProps,
  StepResultItemProps,
  PipelineExecutionCardProps,
  ExtractionResultCardProps,
  ScheduleCardProps,
  AlertItemProps,
} from './extraction-monitor.js';
