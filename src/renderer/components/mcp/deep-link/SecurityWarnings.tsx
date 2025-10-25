import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function SecurityWarnings() {
  return (
    <Alert variant="default" className="border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
      <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
      <AlertDescription className="text-sm text-yellow-800 dark:text-yellow-200">
        <p className="font-medium mb-2">Security Reminders:</p>
        <ul className="space-y-1 text-xs">
          <li>• This server will run with your system permissions</li>
          <li>• Only install servers from trusted sources</li>
          <li>• Review the configuration before proceeding</li>
          <li>• Verify package names match official documentation</li>
        </ul>
      </AlertDescription>
    </Alert>
  );
}
