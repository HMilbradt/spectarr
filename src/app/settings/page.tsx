'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useSettings, useUpdateSetting } from '@/hooks/use-queries';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import { ModelSelector } from '@/components/ModelSelector';
import { SpendDashboard } from '@/components/SpendDashboard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Check, AlertCircle, RefreshCw, Plug, Circle } from 'lucide-react';

interface ServiceConfig {
  openrouter: { configured: boolean; baseUrl: string };
  tmdb: { configured: boolean };
  tvdb: { configured: boolean };
  plex: { configured: boolean; url: string | null };
}

type TestStatus = 'idle' | 'testing' | 'success' | 'error';

interface TestResult {
  status: TestStatus;
  message: string | null;
}

export default function SettingsPage() {
  const [services, setServices] = useState<ServiceConfig | null>(null);
  const [logLevel, setLogLevel] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const { data: settings } = useSettings();
  const updateSetting = useUpdateSetting();
  const modelId = settings?.default_model ?? DEFAULT_MODEL_ID;

  // Test state per service
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({
    openrouter: { status: 'idle', message: null },
    tmdb: { status: 'idle', message: null },
    tvdb: { status: 'idle', message: null },
    plex: { status: 'idle', message: null },
  });

  useEffect(() => {
    async function load() {
      try {
        const configRes = await fetch('/api/config');
        if (configRes.ok) {
          const configData = await configRes.json();
          setServices(configData.services);
          setLogLevel(configData.logLevel);
        }
      } catch {
        // Config endpoint unavailable
      }
      setLoaded(true);
    }
    load();
  }, []);

  async function testService(service: string) {
    setTestResults(prev => ({
      ...prev,
      [service]: { status: 'testing', message: null },
    }));

    try {
      const response = await fetch('/api/config/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });

      const data = await response.json();

      setTestResults(prev => ({
        ...prev,
        [service]: {
          status: data.ok ? 'success' : 'error',
          message: data.message,
        },
      }));

      if (data.ok) {
        toast.success(`${service}: ${data.message}`);
      } else {
        toast.error(`${service}: ${data.message}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Connection test failed';
      setTestResults(prev => ({
        ...prev,
        [service]: { status: 'error', message },
      }));
      toast.error(`${service}: ${message}`);
    }
  }

  function handleModelChange(newModelId: string) {
    updateSetting.mutate(
      { key: 'default_model', value: newModelId },
      { onSuccess: () => toast.success('Default model updated') }
    );
  }

  if (!loaded) return null;

  function renderStatusBadge(configured: boolean) {
    if (configured) {
      return (
        <Badge variant="outline" className="text-green-600 border-green-300">
          <Check className="h-3 w-3 mr-1" />
          Configured
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-muted-foreground border-muted">
        <Circle className="h-3 w-3 mr-1" />
        Not configured
      </Badge>
    );
  }

  function renderTestResult(service: string) {
    const result = testResults[service];
    if (!result || result.status === 'idle') return null;

    if (result.status === 'testing') {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Testing connectivity...
        </div>
      );
    }

    return (
      <div className="mt-2">
        {result.status === 'success' ? (
          <Badge variant="outline" className="text-green-600 border-green-300">
            <Check className="h-3 w-3 mr-1" />
            {result.message}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-red-600 border-red-300">
            <AlertCircle className="h-3 w-3 mr-1" />
            {result.message}
          </Badge>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Service configuration and connectivity status. API keys and credentials are configured
          via environment variables on the server.
        </p>
      </div>

      {/* OpenRouter */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">OpenRouter</CardTitle>
              <CardDescription>
                LLM image analysis via{' '}
                <a
                  href="https://openrouter.ai/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary"
                >
                  openrouter.ai
                </a>
                . Configure via <code className="text-xs bg-muted px-1 py-0.5 rounded">OPENROUTER_API_KEY</code> in
                your <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code> file. Required.
              </CardDescription>
            </div>
            {services && renderStatusBadge(services.openrouter.configured)}
          </div>
        </CardHeader>
        <CardContent>
          {services?.openrouter.baseUrl && (
            <p className="text-xs text-muted-foreground mb-3">
              Base URL: <code className="bg-muted px-1 py-0.5 rounded">{services.openrouter.baseUrl}</code>
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!services?.openrouter.configured || testResults.openrouter.status === 'testing'}
            onClick={() => testService('openrouter')}
          >
            {testResults.openrouter.status === 'testing' ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Plug className="h-4 w-4 mr-1" />
                Test Connection
              </>
            )}
          </Button>
          {renderTestResult('openrouter')}
        </CardContent>
      </Card>

      {/* TMDB */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">TMDB</CardTitle>
              <CardDescription>
                Movie and TV metadata from{' '}
                <a
                  href="https://www.themoviedb.org/settings/api"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary"
                >
                  themoviedb.org
                </a>
                . Configure via <code className="text-xs bg-muted px-1 py-0.5 rounded">TMDB_API_KEY</code> in
                your <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code> file.
                Use the &quot;API Read Access Token&quot; (long token). Required.
              </CardDescription>
            </div>
            {services && renderStatusBadge(services.tmdb.configured)}
          </div>
        </CardHeader>
        <CardContent>
          <Button
            size="sm"
            variant="outline"
            disabled={!services?.tmdb.configured || testResults.tmdb.status === 'testing'}
            onClick={() => testService('tmdb')}
          >
            {testResults.tmdb.status === 'testing' ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Plug className="h-4 w-4 mr-1" />
                Test Connection
              </>
            )}
          </Button>
          {renderTestResult('tmdb')}
        </CardContent>
      </Card>

      {/* TVDB */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">TVDB</CardTitle>
              <CardDescription>
                TVDB ID cross-referencing via{' '}
                <a
                  href="https://www.thetvdb.com/dashboard/account/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary"
                >
                  thetvdb.com
                </a>
                . Configure via <code className="text-xs bg-muted px-1 py-0.5 rounded">TVDB_API_KEY</code> in
                your <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code> file.
                Free for projects under $50k/year. Optional.
              </CardDescription>
            </div>
            {services && renderStatusBadge(services.tvdb.configured)}
          </div>
        </CardHeader>
        <CardContent>
          <Button
            size="sm"
            variant="outline"
            disabled={!services?.tvdb.configured || testResults.tvdb.status === 'testing'}
            onClick={() => testService('tvdb')}
          >
            {testResults.tvdb.status === 'testing' ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Plug className="h-4 w-4 mr-1" />
                Test Connection
              </>
            )}
          </Button>
          {renderTestResult('tvdb')}
        </CardContent>
      </Card>

      {/* Plex */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Plex</CardTitle>
              <CardDescription>
                Cross-reference scanned items with your Plex library. Configure
                via <code className="text-xs bg-muted px-1 py-0.5 rounded">PLEX_URL</code> and{' '}
                <code className="text-xs bg-muted px-1 py-0.5 rounded">PLEX_TOKEN</code> in
                your <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code> file.
                Find your token at{' '}
                <a
                  href="https://support.plex.tv/articles/204059436-finding-an-authentication-token-x-plex-token/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary"
                >
                  Plex support
                </a>
                . Optional.
              </CardDescription>
            </div>
            {services && renderStatusBadge(services.plex.configured)}
          </div>
        </CardHeader>
        <CardContent>
          {services?.plex.url && (
            <p className="text-xs text-muted-foreground mb-3">
              Server: <code className="bg-muted px-1 py-0.5 rounded">{services.plex.url}</code>
            </p>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={!services?.plex.configured || testResults.plex.status === 'testing'}
            onClick={() => testService('plex')}
          >
            {testResults.plex.status === 'testing' ? (
              <>
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                Testing...
              </>
            ) : (
              <>
                <Plug className="h-4 w-4 mr-1" />
                Test Connection
              </>
            )}
          </Button>
          {renderTestResult('plex')}
        </CardContent>
      </Card>

      {/* Model Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Default Model</CardTitle>
          <CardDescription>
            Choose which model to use for image analysis. Different models have different costs and capabilities.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModelSelector value={modelId} onChange={handleModelChange} />
        </CardContent>
      </Card>

      {/* Diagnostics / Logging */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Diagnostics</CardTitle>
          <CardDescription>
            Server-side logging for debugging scan and metadata issues.
            Set the <code className="text-xs bg-muted px-1 py-0.5 rounded">LOG_LEVEL</code> environment
            variable in your <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code> file
            and restart the server. Levels: <code className="text-xs bg-muted px-1 py-0.5 rounded">debug</code>,{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">info</code>,{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">warn</code>,{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">error</code>,{' '}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">silent</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Current log level:</span>
            {logLevel ? (
              <Badge
                variant="outline"
                className={
                  logLevel === 'silent'
                    ? 'text-muted-foreground border-muted'
                    : logLevel === 'debug'
                    ? 'text-blue-600 border-blue-300'
                    : logLevel === 'info'
                    ? 'text-green-600 border-green-300'
                    : logLevel === 'warn'
                    ? 'text-yellow-600 border-yellow-300'
                    : logLevel === 'error'
                    ? 'text-red-600 border-red-300'
                    : ''
                }
              >
                {logLevel}
              </Badge>
            ) : (
              <span className="text-sm text-muted-foreground">Loading...</span>
            )}
          </div>
        </CardContent>
      </Card>

      <Separator />

      {/* Spend Dashboard */}
      <SpendDashboard />
    </div>
  );
}
